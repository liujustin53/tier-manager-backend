import express, { Application, Request, Response } from "express";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
import TierManager from "./TierManager";
dotenv.config();

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const tierManager = TierManager.getInstance();

app.post("/oauth", (req: Request, res: Response) => {
  tierManager.authorizeUser(req.query.code as string, req.query.code_verifier as string)
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
});