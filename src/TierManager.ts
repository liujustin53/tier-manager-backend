import * as dotenv from 'dotenv';
import * as fs from 'fs';
import pkceChallenge from 'pkce-challenge';
import { createClient } from 'redis';
import YAML from 'yaml';

dotenv.config();

type AnimeEntry = {
  anime_id: number;
  main_picture: {
    medium: string;
    large: string;
  };
  score: number;
  is_changed: boolean;
}

type UserConfiguration = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
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

  public async saveCodeChallenge(code_challenge: string, state: string) {
    return await this._redis.set(state, code_challenge);
  }

  public async authorizeUser(authorization_code: string, state: string) {
    try {
      // get code challenge from redis
      const code_challenge = await this._redis.get(state);
      if (!code_challenge) {
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
        code_verifier: code_challenge,
        grant_type: "authorization_code",
      };

      const formBody = Object.keys(details).map((key) => {
        return encodeURIComponent(key) + "=" + encodeURIComponent(details[key as keyof typeof details]);
      }).join("&");

      // console.log(code_challenge);
      // console.log(state);
      // console.log(formBody);

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

      const user: UserConfiguration = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      };

      this._config.users.push(user);
      this.saveConfig();
      console.log("Access token: " + user.access_token);
      return 1;
    } catch (error) {
      console.error(error);
      return 0;
    }
  }
}