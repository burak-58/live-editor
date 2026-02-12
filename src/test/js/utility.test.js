import {
  generateRandomString,
  getQueryParameter,
  getRtmpUrl,
  getSrtURL,
  getWebSocketURL,
} from "../../main/webapp/js/utility.js";
import { getUrlParameter } from "../../main/webapp/js/fetch.stream.js";

describe("utility helpers", () => {
  test("generateRandomString returns expected length", () => {
    const value = generateRandomString(12);
    expect(value).toHaveLength(12);
    expect(value).toMatch(/^[A-Za-z0-9]+$/);
  });

  test("getWebSocketURL builds ws url", () => {
    const location = {
      protocol: "http:",
      hostname: "example.com",
      port: "5080",
      pathname: "/live-editor/index.html",
    };
    expect(getWebSocketURL(location)).toBe("ws://example.com:5080/live-editor/websocket");
  });

  test("getWebSocketURL builds wss url with rtmpForward", () => {
    const location = {
      protocol: "https:",
      hostname: "secure.example.com",
      port: "5443",
      pathname: "/live-editor/index.html",
    };
    expect(getWebSocketURL(location, "1")).toBe("wss://secure.example.com:5443/live-editor/websocket?rtmpForward=1");
  });

  test("getRtmpUrl and getSrtURL use app name", () => {
    const location = {
      hostname: "media.example.com",
      pathname: "/live-editor/index.html",
    };
    expect(getRtmpUrl(location, "stream1")).toBe("rtmp://media.example.com/live-editor/stream1");
    expect(getSrtURL(location, "stream1", 2088)).toBe("srt://media.example.com:2088?streamid=live-editor/stream1");
  });
});

describe("query parameters", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/live-editor/live-editor.html?foo=bar&flag");
  });

  test("getUrlParameter reads values", () => {
    expect(getUrlParameter("foo")).toBe("bar");
    expect(getUrlParameter("flag")).toBe(true);
    expect(getUrlParameter("missing")).toBeUndefined();
  });

  test("getQueryParameter formats optional query", () => {
    expect(getQueryParameter("foo")).toBe("&foo=bar");
    expect(getQueryParameter("flag")).toBe("&flag=true");
    expect(getQueryParameter("missing")).toBe("");
  });
});
