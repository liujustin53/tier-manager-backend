import express, { Application, Request, Response } from "express";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
import { appendFile } from "fs";
dotenv.config();

const app = new App({

});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req: Request, res: Response) => {
  res.send("Healthy");
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
});