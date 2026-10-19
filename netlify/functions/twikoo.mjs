// netlify/functions/twikoo.mjs
// Twikoo Netlify Functions 入口（Modern Functions，ESM 格式）
// 作用：包装官方 twikoo-netlify handler，强制注入 CORS 响应头，解决跨域被拦截问题。

import twikooHandler from "twikoo-netlify";

// ===== CORS 响应头配置 =====
// 生产环境建议把 Access-Control-Allow-Origin 改成你的主站域名，
// 例如 'https://xjdh688.ccwu.cc'；这里用 '*' 方便调试和兼容多端。
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Requested-With, X-Device-Id",
  "Access-Control-Max-Age": "86400"
};

// 统一构造带 CORS 头的响应
function withCors(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}

// 兼容不同风格的 handler 返回值
async function callHandler(request, context) {
  const handler = twikooHandler?.default || twikooHandler?.handler || twikooHandler;
  if (typeof handler !== "function") {
    throw new Error("twikoo-netlify handler is not a function");
  }
  return await handler(request, context);
}

// 把 handler 的返回值统一转为 { status, body }
async function normalizeResponse(rawResponse) {
  // Modern Functions 风格：返回 Response 对象
  if (rawResponse instanceof Response) {
    const body = await rawResponse.text();
    return { status: rawResponse.status || 200, body };
  }
  // 旧 Lambda 风格：返回 { statusCode, body, headers }
  if (rawResponse && typeof rawResponse === "object" && "statusCode" in rawResponse) {
    return {
      status: rawResponse.statusCode || 200,
      body: typeof rawResponse.body === "string" ? rawResponse.body : JSON.stringify(rawResponse.body)
    };
  }
  // 兜底：直接 JSON 化
  return { status: 200, body: JSON.stringify(rawResponse) };
}

export default async (request, context) => {
  // ===== 1. 处理 OPTIONS 预检请求 =====
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ===== 2. 正常请求：调用官方 handler =====
  try {
    const rawResponse = await callHandler(request, context);
    const { status, body } = await normalizeResponse(rawResponse);
    return withCors(body, status);
  } catch (error) {
    console.error("[Twikoo Function] handler error:", error);
    return withCors(
      JSON.stringify({
        code: 500,
        message: "Twikoo 云函数内部错误: " + (error?.message || "unknown")
      }),
      500
    );
  }
};
