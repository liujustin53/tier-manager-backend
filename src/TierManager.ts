import * as dotenv from 'dotenv';
import * as fs from 'fs';
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
  user_name: string;
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


  static getInstance(): TierManager {
    if (!TierManager._instance) {
      TierManager._instance = new TierManager();
    }
    return TierManager._instance;
  }

  constructor() {
    this._config = { users: [] };
    if (fs.existsSync("config.yml")) {
      this._config = YAML.parse(fs.readFileSync("config.yml", "utf-8")) as AppConfiguration;
    }
  }

  saveConfig() {
    fs.writeFileSync("config.yml", YAML.stringify(this._config));
  }

  public async authorizeUser(authorization_code: string, code_verifier: string): Promise<UserConfiguration> {

    // authorize user
    const response = await fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI,
        code: authorization_code,
        code_verifier: code_verifier,
        grant_type: "authorization_code",
      }),
    });
    const data = await response.json();

    // get user name
    const userResponse = await fetch("https://api.myanimelist.net/v2/users/@me", {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + data.access_token,
        "Content-Type": "application/json",
        "Accept": "application/json",
      }
    });

    const userData = await userResponse.json();
    const userName = userData.name;

    
    const user: UserConfiguration = {
      user_name: userName,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    };

    this._config.users.push(user);
    this.saveConfig();

    return user;
  }
}