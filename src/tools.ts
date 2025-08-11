import { IKobartTool, IOcrTool, IClassifierTool } from "./types";
import OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import FormData from "form-data";
import fs from "fs";

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || "http://localhost:7001";
const KOBART_SERVICE_URL = process.env.KOBART_SERVICE_URL || "http://localhost:8000";


export class KobartTool implements IKobartTool {
  /**
   * 사용자가 텍스트를 입력하면 민원 문체로 바꿔줍니다.
   */
  async polishToComplaintTone(input: { text: string }): Promise<string> {
    try {
      const response = await fetch(`${KOBART_SERVICE_URL}/kgpt/polish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          text: input.text
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`KoBART service error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      const transformedText = result.transformed_text || result.formalText || result.text || input.text;

      return transformedText;

    } catch (error) {
      console.error(`[KobartTool] Error:`, error);
      console.log(`[KobartTool] Fallback: returning original text`);
      return input.text;
    }
  }
}

export class OcrTool implements IOcrTool {
  async extractTextFromImage(input: { imagePath: string }): Promise<string> {
    try {
      if (!fs.existsSync(input.imagePath)) {
        throw new Error(`Image file not found: ${input.imagePath}`);
      }

      const formData = new FormData();
      formData.append('file', fs.createReadStream(input.imagePath));

      const response = await fetch(`${OCR_SERVICE_URL}/ocr/extract`, {
        method: "POST",
        body: formData as any,
        headers: formData.getHeaders()
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OCR service error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();

      return result.ocr_text || "";

    } catch (error: any) {
      console.error(`[OcrTool] Error:`, error);
      throw new Error(`OCR 실행 실패: ${error?.message || String(error)}`);
    }
  }
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

  async classifyDepartment({ text }: { text: string }): Promise<{
    best_department: string;
    reason: string;
    confidence: number;
  }> {
    try {
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
                  enum: DEPTS,
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

부서 목록: ${DEPTS.join(", ")}
      `.trim();

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        tools: tools,
        tool_choice: "required"
      });

      const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== 'function') {
        throw new Error("No function tool call in response");
      }

      const result = JSON.parse(toolCall.function.arguments);
      return {
        best_department: result.best_department,
        reason: result.reason,
        confidence: result.confidence
      };

    } catch (error) {
      console.error(`[ClassifierTool] Error:`, error);

      return {
        best_department: "기타",
        reason: "분류 중 오류가 발생했습니다",
        confidence: 0.0
      };
    }
  }
}
