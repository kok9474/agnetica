export interface IKobartTool {
  /**
   * 사용자가 텍스트를 입력하면 민원 문체로 바꿔줍니다.
   */
  polishToComplaintTone(input: { text: string }): Promise<string>;
}

export interface IOcrTool {
  /**
   * 사용자에게 이미지 경로를 받으면 이미지에서 자동차 번호판을 탐지합니다.
   */
  extractTextFromImage(input: { imagePath: string }): Promise<string>;
}

export interface IClassifierTool {
  /**
   * 사용자가 관련 부서를 찾아달라고 하면 실행합니다.
   */
  classifyDepartment(input: { text: string }): Promise<{
    best_department: string;
    reason: string;
    confidence: number;
  }>;
}