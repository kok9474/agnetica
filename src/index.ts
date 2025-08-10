import { Agentica, IAgenticaHistoryJson } from "@agentica/core";
import {
  AgenticaRpcService,
  IAgenticaRpcListener,
  IAgenticaRpcService,
} from "@agentica/rpc";
import OpenAI from "openai";
import { WebSocketServer } from "tgrid";
import typia, { Primitive } from "typia";

import { SGlobal } from "./SGlobal";

  import { ArxivSearchService } from "@wrtnlabs/connector-arxiv-search";

const getPromptHistories = async (
  id: string,
): Promise<Primitive<IAgenticaHistoryJson>[]> => {
  // GET PROMPT HISTORIES FROM DATABASE
  id;
  return [];
};

const main = async (): Promise<void> => {
  if (SGlobal.env.OPENAI_API_KEY === undefined)
    console.error("env.OPENAI_API_KEY is not defined.");

  const server: WebSocketServer<
    null,
    IAgenticaRpcService<"chatgpt">,
    IAgenticaRpcListener
  > = new WebSocketServer();
  await server.open(Number(SGlobal.env.PORT), async (acceptor) => {
    const url: URL = new URL(`http://localhost${acceptor.path}`);
    const agent: Agentica<"chatgpt"> = new Agentica({
      model: "chatgpt",
      vendor: {
        api: new OpenAI({ apiKey: SGlobal.env.OPENAI_API_KEY }),
        model: "gpt-4o-mini",
      },
      controllers: [  {
  name: "ArxivSearch Connector",
  protocol: "class",
  application: typia.llm.application<ArxivSearchService, "chatgpt">(),
  execute: new ArxivSearchService(),
  }],
      histories:
        // check {id} parameter
        url.pathname === "/"
          ? []
          : await getPromptHistories(url.pathname.slice(1)),
    });
    const service: AgenticaRpcService<"chatgpt"> = new AgenticaRpcService({
      agent,
      listener: acceptor.getDriver(),
    });
    await acceptor.accept(service);
  });
};
main().catch(console.error);
