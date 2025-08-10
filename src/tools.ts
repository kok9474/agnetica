import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import type { IClassifierTool } from "./types";
import OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

const execFileAsync = promisify(execFile);

export class KobartTool {
  /**
   * 사용자가 텍스트를 입력하면 민원 문체로 바꿔줍니다.
   */
  async polishToComplaintTone(input: { text: string }): Promise<string> {
    const textResp = await fetch("http://localhost:8000/kgpt/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        model: "model_ko"
      })
    });
    return await textResp.text();
  }
}

export class OcrTool{
  /**
   * 사용자에게 이미지 경로를 받으면 이미지에서 자동차 번호판을 탐지합니다.
   */
  // async extractTextFromImage(input: { imagePath: string }): Promise<string> {
  //   const pythonBin = process.env.PYTHON_BIN || "python"; // 윈도우면 'py'로 바꿔도 됨

  //   const script = path.resolve(__dirname, "ocr_tool.py");

  //   try {
  //     const { stdout } = await execFileAsync(pythonBin, [script, input.imagePath], {
  //       windowsHide: true,
  //     });
  //     return stdout.trim();
  //   } catch (err: any) {
  //     const msg = err?.stderr?.toString?.() || err?.message || String(err);
  //     throw new Error(`OCR 실행 실패: ${msg}`);
  //   }
  // }  
}

const DEPTS = [
  "도로교통과", "공원녹지과", "청소행정과", "고용노동부",
  "교육청", "주차단속팀", "건축과", "도시계획과", "교통행정과", "기타"
];

export class ClassifierTool implements IClassifierTool {
  /**
   * 사용자가 관련 부서를 찾아달라고 하면 실행합니다.
   */
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }

  async classifyDepartment({ text }: { text: string }) {
    // 1) 함수 도구 정의: enum으로 후보를 강제
    const tools: ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "pick_department",
          description: "민원 텍스트에 대한 최적 부서를 선택한다.",
          parameters: {
            type: "object",
            properties: {
              best_department: {
                type: "string",
                enum: DEPTS, // ✅ 목록 강제
                description: "부서 후보 목록 중 하나",
              },
              reason: {
                type: "string",
                description: "한두 문장 근거",
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1,
                description: "0~1 신뢰도",
              },
            },
            required: ["best_department", "reason", "confidence"],
            additionalProperties: false,
          },
        },
      },
    ];

    const systemPrompt = `
입력 텍스트를 읽고, 아래 enum 목록 중 정확히 1개 부서를 선택하세요.
없으면 "기타"를 선택하세요.
반드시 함수를 호출해 결과를 반환하세요.
`.trim();

    // 2) 함수 호출을 강제(tool_choice)
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            `부서 후보 목록:\n${DEPTS.map((d, i) => `- ${i + 1}. ${d}`).join("\n")}\n\n` +
            `텍스트:\n${text}`,
        },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "pick_department" } }, // ✅ 강제
    });

    // 3) tool call 파싱
    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") {
      // 방어: 함수 호출이 오지 않았다면 "기타"
      return {
        best_department: "기타",
        reason: "모델이 함수 호출을 반환하지 않았습니다.",
        confidence: 0,
      };
    }

    let args: any = {};
    try {
      args = JSON.parse(toolCall.function.arguments || "{}");
    } catch {
      args = {};
    }

    const bestRaw = String(args.best_department ?? "").trim();
    const reason = String(args.reason ?? "").trim();
    let conf = Number(args.confidence);
    if (!Number.isFinite(conf)) conf = 0;
    conf = Math.min(1, Math.max(0, conf));

    // 4) 최종 안전망
    const best = DEPTS.includes(bestRaw) ? bestRaw : "기타";

    return {
      best_department: best,
      reason,
      confidence: conf,
    };
  }
}