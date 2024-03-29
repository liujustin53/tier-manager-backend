import express, { Application, Request, Response } from "express";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
import TierManager from "./TierManager";
import cors from 'cors';
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();

app.use(cors({ credentials: true, origin: true }));

app.use(cookieParser());

const tierManager = TierManager.getInstance();

app.post("/oauth/authorize", async (req, res) => {
  try {
    console.log("Received code challenge and state");
    // save code challenge and state from url query
    const code_challenge = req.query.code_challenge as string;
    const state = req.query.state as string;

    if (!code_challenge || !state) {
      res.status(400).send("Invalid request");
      return;
    }

    const result = await tierManager.saveCodeChallenge(state, code_challenge);
    if (!result) {
      res.status(500).send("Internal server error");
      return;
    }

    console.log("Code challenge and state saved.");
    res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

app.get("/oauth/redirect", async (req, res) => {
  try {
    console.log("Received authorization code");
    // save authorization code and state from url query
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
      res.status(400).send("Invalid request");
      return;
    }

    const session_id = await tierManager.authorizeUser(code, state);

    console.log("User authorized");

    res.cookie("session_id", session_id, { httpOnly: true });
    res.cookie("is_logged_in", 1);
    res.redirect("http://localhost:3000/dashboard");
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

app.post("/oauth/logout", async (req, res) => {
  try {
    console.log("Received logout request");

    const session_id = req.cookies.session_id;
    if (!session_id) {
      res.status(400).send("Invalid request");
      return;
    }
    console.log("Session id: " + session_id);

    tierManager.logoutUser(session_id);
    console.log("User logged out");

    res.cookie("session_id", "", { expires: new Date(0), httpOnly: true});
    res.cookie("is_logged_in", 0);
    res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

app.get("/api/list", async (req, res) => {
  try {
    console.log(`Received request for user list`);

    const type = req.query.type as string;
    const session_id = req.cookies.session_id;

    if (!type || (type !== "anime" && type !== "manga") || !session_id) {
      res.status(400).send("Invalid request");
      return;
    }

    console.log("Type: " + type);
    console.log("Session id: " + session_id);

    const anime_list = await tierManager.getEntryList(session_id, type);

    console.log(`${type} list sent`);

    res.status(200).json({ list: anime_list });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

app.get("/api/tiers", async (req, res) => {
  try {
    console.log(`Received request for tier list`);

    const session_id = req.cookies.session_id;

    if (!session_id) {
      res.status(400).send("Invalid request");
      return;
    }

    console.log("Session id: " + session_id);

    const tier_list = await tierManager.getTierConfig(session_id);

    console.log(`Tier list sent`);

    res.status(200).json({ tiers: tier_list });

  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, async () => {
  console.log(`Server is running on PORT ${PORT}`);
  await tierManager.init();
});