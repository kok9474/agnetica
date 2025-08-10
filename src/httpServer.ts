// src/httpServer.ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Agentica } from "@agentica/core";
import typia from "typia";
import OpenAI from "openai";
import { IKobartTool, IClassifierTool } from "./types";
import { KobartTool, OcrTool, ClassifierTool} from "./tools";
import readline from "readline";

dotenv.config();

export async function startHttpServer(port = 9000) {
  // ① OpenAI 클라이언트 초기화
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
  });

  // ② Agentica 인스턴스 설정
  const agent = new Agentica({
    model: "chatgpt",
    vendor: {
      model: "gpt-4o-mini",
      api: openai,
    },
    controllers: [
      {
        protocol: "class",
        name: "Kobart Tool",
        application: typia.llm.application<IKobartTool, "chatgpt">(),
        execute: new KobartTool(),
      },
      {
        protocol: "class",
        name: "Classifier Tool",
        application: typia.llm.application<IClassifierTool, "chatgpt">(),
        execute: new ClassifierTool(),
      },
    ],
  });

  // ③ Express 앱 셋업
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ④ POST /text/transform 엔드포인트
  app.post("/text/transform", async (req, res) => {
    const { rawText } = req.body;
    const prompt = `
다음 민원 문장을 민원 유형에 맞춰 “격어체(존댓말)”로 변환주세요.

원문: ${rawText}

출력 JSON 형식:
{
  "formalText": "<격어체 변환된 문장>"
}
    `.trim();

    try {
      const response = await agent.conversate(prompt);
      // 문자열 JSON이면 파싱, 아니면 그대로 반환
      const parsed =
        typeof response === "string" ? JSON.parse(response) : response;
      res.json(parsed);
    } catch (err: unknown) {
      console.error("Text transform error:", err);
      res
        .status(500)
        .json({ error: "Text transform failed", detail: String(err) });
    }
  });

  app.post("/classify", async (req, res) => {
  try {
    const { text } = req.body ?? {};
    if (!text) return res.status(400).json({ error: "text가 필요합니다." });

    const prompt = `
아래 민원 텍스트의 담당 부서를 분류하세요.
반드시 JSON으로:
{"best_department":"...", "reason":"...", "confidence":...}
텍스트: ${text}
`.trim();

    const answers = await agent.conversate(prompt);
    return res.json(answers);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "classification failed", detail: String(err?.message ?? err) });
  }
  });


  // ⑤ 서버 시작
  app.listen(port, () =>{
    console.log(`Text server running at http://localhost:${port}`)
     // 터미널에서 대화를 주고받기 위한 readline interface 생성
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Agent와 대화하는 함수.
    const conversation = () => {
      rl.question("User Input (exit: q) : ", async (input) => {
        // q를 입력하면 대화가 종료.
        if (input === "q") {
          rl.close();
          return;
        }
      
        const answers = await agent.conversate(input);

        // Agent의 답변을 console.log한다.
        answers.forEach((answer) => {
          console.log(JSON.stringify(answer, null, 2));
        });

        // 대화를 지속할 수 있도록 재귀호출.
        conversation();
      });
    };

  conversation();
});
}

// 바로 실행
startHttpServer().catch(console.error);
