import express, { Application, Request, Response } from "express";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
import TierManager from "./TierManager";
import cors from 'cors';

dotenv.config();

const app = express();

app.use(cors());

const tierManager = TierManager.getInstance();

app.get("/oauth/redirect", async (req, res) => {
  console.log("Received authorization code");
  // save authorization code and state from url query
  const code = req.query.code as string;
  const state = req.query.state as string;

  if (!code || !state) {
    res.status(400).send("Invalid request");
    return;
  }

  const result = await tierManager.authorizeUser(code, state);
  if (!result) {
    res.status(500).send("Internal server error");
    return;
  }

  console.log("User authorized");
  res.redirect("http://localhost:3000/profile");
});

app.post("/oauth/challenge", async (req, res) => {
  console.log("Received code challenge and state");

  // save code challenge and state from url query
  const code_challenge = req.query.code_challenge as string;
  const state = req.query.state as string;

  if (!code_challenge || !state) {
    res.status(400).send("Invalid request");
    return;
  }

  const result = await tierManager.saveCodeChallenge(code_challenge, state);
  if (!result) {
    res.status(500).send("Internal server error");
    return;
  }

  console.log("Code challenge and state saved.");
  res.status(200).send("OK");
});

app.get("/oauth/challenge", async (req, res) => {
  console.log("Received code challenge and state");
});


const PORT = process.env.PORT || 8000;

app.listen(PORT, async () => {
  console.log(`Server is running on PORT ${PORT}`);
  await tierManager.init();
});