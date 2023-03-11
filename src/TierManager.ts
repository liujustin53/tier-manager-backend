import { randomBytes } from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { createClient } from 'redis';
import YAML from 'yaml';

dotenv.config();

type ListEntry = {
  animanga_id: number;
  main_picture: string;
  score: number;
  // is_changed: boolean;
}

type UserConfiguration = {
  session_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  anime_list?: ListEntry[];
  manga_list?: ListEntry[];
}

type AppConfiguration = {
  users: UserConfiguration[];
}

export default class TierManager {
  private static _instance: TierManager;
  private _config: AppConfiguration;
  private _redis;

  static getInstance(): TierManager {
    if (!TierManager._instance) {
      TierManager._instance = new TierManager();
    }
    return TierManager._instance;
  }

  constructor() {
    this._config = { users: [] };
    this._redis = createClient();
    if (fs.existsSync("config.yml")) {
      this._config = YAML.parse(fs.readFileSync("config.yml", "utf-8")) as AppConfiguration;
    }
  }

  async init() {
    this._redis.on("error", (error) => { console.error(error); });
    await this._redis.connect();
  }

  saveConfig() {
    fs.writeFileSync("config.yml", YAML.stringify(this._config));
  }

  // saves the code challenge at the state as key
  // returns 'OK' if successful or null if not
  public async saveCodeChallenge(state: string, code_challenge: string) {
    return await this._redis.set(state, code_challenge);
  }

  // generates a random session id of 32 characters
  async generateSessionId() {
    return randomBytes(16).toString("hex");
  }

  /**
   * Authorizes the user with MAL and saves the user configuration
   * @param authorization_code 
   * @param state 
   * @throws Error if the state is invalid or the user could not be authorized
   * @returns the session id of the user if successful
   */
  public async authorizeUser(authorization_code: string, state: string) {
    // get code challenge from redis
    const code_verifier = await this._redis.get(state);
    if (!code_verifier) {
      throw new Error("Invalid state");
    }
    // delete code challenge from redis
    await this._redis.del(state);

    // authorize user
    const details = {
      client_id: process.env.CLIENT_ID || "",
      client_secret: process.env.CLIENT_SECRET || "",
      redirect_uri: process.env.REDIRECT_URI || "",
      code: authorization_code,
      code_verifier: code_verifier,
      grant_type: "authorization_code",
    };

    const formBody = Object.keys(details).map((key) => {
      return encodeURIComponent(key) + "=" + encodeURIComponent(details[key as keyof typeof details]);
    }).join("&");

    const response = await fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: formBody,
    });

    if (response.status !== 200) {
      throw new Error("Failed to authorize user");
    }

    const data = await response.json();

    // save user configuration
    const user: UserConfiguration = {
      session_id: await this.generateSessionId(),
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in,
    };

    this._config.users.push(user);
    this.saveConfig();

    // save session id to redis
    await this._redis.set(user.session_id, user.access_token);

    return user.session_id;
  }

  /**
   * Removes the user with the given session id from the configuration.
   * @param session_id the session id of the user
   */
  public async logoutUser(session_id: string) {
    this._config.users = this._config.users.filter((user) => user.session_id !== session_id);
    this.saveConfig();
  }

  /**
   * Refreshes the access token for the provided user
   * @param user
   */
  public async refreshAccessToken(user: UserConfiguration) {
    const details = {
      client_id: process.env.CLIENT_ID || "",
      client_secret: process.env.CLIENT_SECRET || "",
      refresh_token: user.refresh_token,
      grant_type: "refresh_token",
    };

    const formBody = Object.keys(details).map((key) => {
      return encodeURIComponent(key) + "=" + encodeURIComponent(details[key as keyof typeof details]);
    }).join("&");

    const response = await fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: formBody,
    });

    if (response.status !== 200) {
      throw new Error("Failed to refresh access token");
    }

    const data = await response.json();

    user.access_token = data.access_token;
    user.refresh_token = data.refresh_token;
    user.expires_at = Date.now() + data.expires_in;

    this.saveConfig();

    console.log("Refreshed access token");
  }

  /**
   * Gets the access token associated with the session id.
   * If the access token is expired, it will be refreshed
   * @param session_id the session id of the user
   * @throws Error if the session id is invalid
   * @returns the access token of the user with the given session id
   */
  public async getAccessToken(session_id: string) {
    console.log("Getting access token");

    const user = this._config.users.find((user) => user.session_id === session_id);

    // check if user found
    if (!user) {
      throw new Error("Invalid session id");
    }

    // check if access token expired
    if (user.expires_at < Date.now()) {
      await this.refreshAccessToken(user);
    }

    return user.access_token;
  }

  /**
   * Gets the list of the user with the given session id
   * @param session_id the session id of the user
   * @param type the type of list to get, either anime or manga
   * @throws Error if the session id is invalid
   * @returns the anime list of the user with the given session id
   */
  public async getAnimangaList(session_id: string, type: "anime" | "manga") {
    const user = this._config.users.find((user) => user.session_id === session_id);
    if (!user) {
      throw new Error("Invalid session id");
    }

    const list_type = type === "anime" ? "anime_list" : "manga_list";

    // check if user configuration already has the list saved
    if (user[list_type]) {
      console.log(`Using cached ${type} list`);
      return user[list_type];
    }

    const access_token = user.access_token;

    let next = `https://api.myanimelist.net/v2/users/@me/${type}list?fields=list_status&status=completed&limit=1000&sort=list_score`;

    // make requests until there are no more pages
    while (next) {
      // get set of anime/manga
      const response = await fetch(next, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      if (response.status !== 200) {
        throw new Error(`Failed to get ${type} list`);
      }

      const data = await response.json();

      let entries: ListEntry[] = [];

      // add the relevant data to the entries array
      data.data.forEach((animanga: any) => {
        const animanga_id = animanga.node.id;
        const main_picture = animanga.node.main_picture.medium;
        const score = animanga.list_status.score;
        entries.push({ animanga_id, main_picture, score });
      });

      if (user[list_type]) {
        user[list_type] = user[list_type]?.concat(entries);
      } else {
        user[list_type] = entries;
      }

      // get next page
      next = data.paging.next;
    };

    this.saveConfig();

    return user.anime_list;
  }
}