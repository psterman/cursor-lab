var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-qyk9zW/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/body.js
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = request instanceof HonoRequest ? request.raw.headers : request.headers;
  const contentType = headers.get("Content-Type");
  if (contentType?.startsWith("multipart/form-data") || contentType?.startsWith("application/x-www-form-urlencoded")) {
    return parseFormData(request, { all, dot });
  }
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  const formData = await request.formData();
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value) => {
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const path = url.slice(start, queryIndex === -1 ? void 0 : queryIndex);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63) {
      break;
    }
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURIComponent_), "tryDecodeURIComponent");
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return this.bodyCache.parsedBody ??= await parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= new Response(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = new Response(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) {
      this.#res = new Response(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return new Response(data, { status, headers: responseHeaders });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  }, "text");
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => new Response();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class _Hono {
  static {
    __name(this, "_Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = url.pathname.slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    }, "handler");
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = { basePath: this._basePath, path, method, handler };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = /* @__PURE__ */ __name((input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  }, "request");
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match2");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class _Node {
  static {
    __name(this, "_Node");
  }
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
__name(clearWildcardRegExpCache, "clearWildcardRegExpCache");
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
__name(buildMatcherFromPreprocessedRoutes, "buildMatcherFromPreprocessedRoutes");
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var Node2 = class _Node2 {
  static {
    __name(this, "_Node");
  }
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #getHandlerSets(node, method, nodeParams, params) {
    const handlerSets = [];
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
    return handlerSets;
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              handlerSets.push(
                ...this.#getHandlerSets(nextNode.#children["*"], method, node.#params)
              );
            }
            handlerSets.push(...this.#getHandlerSets(nextNode, method, node.#params));
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              handlerSets.push(...this.#getHandlerSets(astNode, method, node.#params));
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          const restPathString = parts.slice(i).join("/");
          if (matcher instanceof RegExp) {
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              handlerSets.push(...this.#getHandlerSets(child, method, node.#params, params));
              if (Object.keys(child.#children).length) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              handlerSets.push(...this.#getHandlerSets(child, method, params, node.#params));
              if (child.#children["*"]) {
                handlerSets.push(
                  ...this.#getHandlerSets(child.#children["*"], method, params, node.#params)
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      curNodes = tempNodes.concat(curNodesQueue.shift() ?? []);
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// node_modules/hono/dist/middleware/cors/index.js
var cors = /* @__PURE__ */ __name((options) => {
  const defaults = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    allowHeaders: [],
    exposeHeaders: []
  };
  const opts = {
    ...defaults,
    ...options
  };
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") {
        return () => optsOrigin;
      } else {
        return (origin) => optsOrigin === origin ? origin : null;
      }
    } else if (typeof optsOrigin === "function") {
      return optsOrigin;
    } else {
      return (origin) => optsOrigin.includes(origin) ? origin : null;
    }
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") {
      return optsAllowMethods;
    } else if (Array.isArray(optsAllowMethods)) {
      return () => optsAllowMethods;
    } else {
      return () => [];
    }
  })(opts.allowMethods);
  return /* @__PURE__ */ __name(async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    __name(set, "set");
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }
    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }
    if (opts.exposeHeaders?.length) {
      set("Access-Control-Expose-Headers", opts.exposeHeaders.join(","));
    }
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") {
        set("Vary", "Origin");
      }
      if (opts.maxAge != null) {
        set("Access-Control-Max-Age", opts.maxAge.toString());
      }
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods.length) {
        set("Access-Control-Allow-Methods", allowMethods.join(","));
      }
      let headers = opts.allowHeaders;
      if (!headers?.length) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) {
          headers = requestHeaders.split(/\s*,\s*/);
        }
      }
      if (headers?.length) {
        set("Access-Control-Allow-Headers", headers.join(","));
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") {
      c.header("Vary", "Origin", { append: true });
    }
  }, "cors2");
}, "cors");

// src/worker/scoring.ts
var NEGATION_WORDS = {
  // 中文否定词
  chinese: [
    "\u4E0D",
    "\u6CA1",
    "\u6CA1\u6709",
    "\u975E",
    "\u65E0",
    "\u672A",
    "\u522B",
    "\u4E0D\u8981",
    "\u4E0D\u884C",
    "\u4E0D\u5BF9",
    "\u9519\u8BEF",
    "\u9519\u4E86",
    "\u5931\u8D25",
    "\u5931\u8D25",
    "\u5931\u8D25",
    "\u5931\u8D25",
    "\u5931\u8D25",
    "\u5931\u8D25",
    "\u95EE\u9898",
    "\u95EE\u9898",
    "\u95EE\u9898",
    "\u95EE\u9898",
    "\u95EE\u9898",
    "\u95EE\u9898",
    "\u95EE\u9898",
    "\u95EE\u9898",
    "\u4E0D\u884C",
    "\u4E0D\u80FD",
    "\u4E0D\u53EF\u4EE5",
    "\u4E0D\u5E94\u8BE5",
    "\u4E0D\u5E94\u8BE5",
    "\u4E0D\u5E94\u8BE5",
    "\u4E0D\u5E94\u8BE5",
    "\u9519\u8BEF",
    "\u9519\u8BEF",
    "\u9519\u8BEF",
    "\u9519\u8BEF",
    "\u9519\u8BEF",
    "\u9519\u8BEF",
    "\u9519\u8BEF",
    "\u9519\u8BEF",
    "\u4FEE\u590D",
    "\u4FEE\u590D",
    "\u4FEE\u590D",
    "\u4FEE\u590D",
    "\u4FEE\u590D",
    "\u4FEE\u590D",
    "\u4FEE\u590D",
    "\u4FEE\u590D",
    "\u6539",
    "\u6539",
    "\u6539",
    "\u6539",
    "\u6539",
    "\u6539",
    "\u6539",
    "\u6539"
  ],
  // 英文否定词
  english: [
    "no",
    "not",
    "wrong",
    "error",
    "fail",
    "failed",
    "failure",
    "incorrect",
    "invalid",
    "bad",
    "broken",
    "fix",
    "fixes",
    "fixed",
    "bug",
    "bugs",
    "issue",
    "issues",
    "problem",
    "problems",
    "don't",
    "doesn't",
    "didn't",
    "won't",
    "can't",
    "couldn't",
    "never",
    "none",
    "nothing",
    "nowhere"
  ]
};
var MODIFIER_WORDS = {
  chinese: [
    "\u975E\u5E38",
    "\u7279\u522B",
    "\u6781\u5176",
    "\u76F8\u5F53",
    "\u5341\u5206",
    "\u5F88",
    "\u6BD4\u8F83",
    "\u7A0D\u5FAE",
    "\u8BE6\u7EC6",
    "\u5177\u4F53",
    "\u5B8C\u6574",
    "\u5168\u9762",
    "\u6DF1\u5165",
    "\u900F\u5F7B",
    "\u4ED4\u7EC6",
    "\u8BA4\u771F",
    "\u7EC6\u81F4",
    "\u7CBE\u786E",
    "\u51C6\u786E",
    "\u6E05\u6670",
    "\u660E\u786E",
    "\u5927\u6982",
    "\u53EF\u80FD",
    "\u4E5F\u8BB8",
    "\u6216\u8BB8",
    "\u5E94\u8BE5",
    "\u4F30\u8BA1",
    "\u9996\u5148",
    "\u7136\u540E",
    "\u63A5\u7740",
    "\u6700\u540E",
    "\u53E6\u5916",
    "\u6B64\u5916",
    "\u800C\u4E14",
    "\u56E0\u4E3A",
    "\u6240\u4EE5",
    "\u4F46\u662F",
    "\u7136\u800C",
    "\u4E0D\u8FC7",
    "\u867D\u7136",
    "\u5C3D\u7BA1"
  ],
  english: [
    "very",
    "quite",
    "rather",
    "extremely",
    "highly",
    "completely",
    "totally",
    "absolutely",
    "perfectly",
    "exactly",
    "precisely",
    "specifically",
    "particularly",
    "especially",
    "especially",
    "detailed",
    "comprehensive",
    "thorough",
    "careful",
    "precise",
    "probably",
    "maybe",
    "perhaps",
    "possibly",
    "likely",
    "first",
    "then",
    "next",
    "finally",
    "also",
    "moreover",
    "furthermore",
    "because",
    "so",
    "but",
    "however",
    "although",
    "though"
  ]
};
var TECH_PATTERNS = {
  // 1. 编程语言 (Core Languages)
  languages: [
    // C/C++ Ecosystem
    /\b(c\+\+|cpp|cplusplus|objective-c|objc)\b/gi,
    /\b(c lang|gcc|clang|msvc|cmake|makefile|stl|boost|qt|mfc|win32 api)\b/gi,
    // Java/JVM Ecosystem
    /\b(java|jdk|jre|jvm|kotlin|scala|groovy|clojure)\b/gi,
    /\b(spring boot|spring cloud|hibernate|mybatis|jpa|jakarta|maven|gradle|ant|junit|testng)\b/gi,
    // .NET Ecosystem
    /\b(c#|csharp|f#|dotnet|\.net|asp\.net|entity framework|blazor|razor|nuget|xamarin|maui)\b/gi,
    // Scripting & Dynamic
    /\b(python|javascript|typescript|php|ruby|lua|perl|bash|shell|powershell|zsh|tcl)\b/gi,
    /\b(node\.js|deno|bun|composer|pip|conda|gem)\b/gi,
    // Modern & Systems
    /\b(go|golang|rust|swift|dart|elixir|haskell|erlang|julia|r lang|matlab|fortran|cobol|assembly|wasm|zig|nim|crystal)\b/gi
  ],
  // 2. 移动与嵌入式 (Mobile & Embedded)
  mobile_embedded: [
    // Android
    /\b(android|apk|aar|adb|logcat|jetpack compose|material design|ndk|jni)\b/gi,
    /\b(activity|fragment|intent|service|broadcast receiver|content provider|gradle|retrofit|okhttp|room)\b/gi,
    // iOS/Mac
    /\b(ios|macos|watchos|tvos|swiftui|uikit|cocoa|xcode|cocoapods|carthage|spm|core data|arkit)\b/gi,
    // Embedded & IoT & Smart TV
    /\b(webos|tizen|harmonyos|openharmony|embedded|iot|arduino|raspberry pi|esp32|stm32|rtos|firmware|driver)\b/gi,
    /\b(enes|webos|enact|luna-service|palm)\b/gi,
    // Cross Platform
    /\b(flutter|react native|uniapp|taro|ionic|cordova|capacitor|expo|weex|qt quick|qml)\b/gi
  ],
  // 3. 计算机科学基础与底层 (CS Fundamentals)
  cs_concepts: [
    // 算法与数据结构
    /\b(algorithm|data structure|big o|recursion|sorting|searching|graph|tree|linked list|hash map|binary search|queue|stack|heap|trie)\b/gi,
    /\b(dfs|bfs|dp|dynamic programming|greedy|backtracking|divide and conquer|sliding window|two pointers)\b/gi,
    // 操作系统与并发
    /\b(process|thread|concurrency|parallelism|mutex|semaphore|deadlock|race condition|context switch|coroutine|async\/await)\b/gi,
    /\b(memory management|garbage collection|heap|stack|buffer overflow|memory leak|pointer|reference|virtual memory|kernel|syscall)\b/gi,
    // 网络与协议
    /\b(tcp|udp|dns|http|https|ssl|tls|ssh|ftp|smtp|websocket|socket|ip address|subnet|vlan|vpn|cors|rest|graphql|grpc|protobuf)\b/gi,
    // 设计模式与架构
    /\b(oop|functional programming|solid|dry|kiss|design pattern|singleton|factory|observer|dependency injection|mvc|mvvm|mvp|microservice|serverless)\b/gi,
    /\b(monolith|distributed system|cap theorem|event sourcing|cqrs|domain driven design|ddd)\b/gi
  ],
  // 4. AI, LLM & Data Science (Frontiers)
  ai_data: [
    // LLM & Agents
    /\b(openai|anthropic|claude|gpt|llama|mistral|ollama|gemini|huggingface|midjourney|stable diffusion)\b/gi,
    /\b(langchain|llamaindex|rag|agent|prompt engineering|embedding|fine-tuning|inference|token|context window|rlhf)\b/gi,
    // ML/DL Frameworks
    /\b(pytorch|tensorflow|keras|jax|scikit-learn|pandas|numpy|matplotlib|jupyter|anaconda|opencv|scipy)\b/gi,
    // Vector DB & Search
    /\b(pinecone|milvus|weaviate|chroma|faiss|elasticsearch|solr|lucene|meilisearch)\b/gi,
    // Big Data
    /\b(hadoop|spark|kafka|flink|airflow|etl|data warehouse|data lake|snowflake|databricks|hive|hbase)\b/gi
  ],
  // 5. 现代 Web 全栈 (Web Fullstack)
  web_fullstack: [
    // 框架
    /\b(react|vue|angular|svelte|next\.js|nuxt|remix|astro|solidjs|jquery|backbone|ember)\b/gi,
    /\b(express|koa|nest|django|flask|fastapi|laravel|symfony|rails|gin|fiber|hono|phoenix)\b/gi,
    // 样式与组件
    /\b(tailwind|bootstrap|sass|less|css-in-js|styled-components|material-ui|antd|shadcn|radix|chakra)\b/gi,
    // 状态管理与API
    /\b(redux|mobx|zustand|pinia|vuex|recoil|jotai|tanstack query|swr|axios|fetch)\b/gi,
    // 构建工具
    /\b(webpack|vite|rollup|esbuild|turbopack|babel|eslint|prettier|npm|yarn|pnpm|bun)\b/gi,
    // 运行时与环境
    /\b(browser|dom|virtual dom|shadow dom|web components|service worker|pwa|wasm|webassembly)\b/gi
  ],
  // 6. DevOps, Cloud & Database (Infrastructure)
  infra_ops: [
    // 容器与编排
    /\b(docker|kubernetes|k8s|helm|container|image|volume|pod|docker-compose|podman)\b/gi,
    // 云厂商
    /\b(aws|azure|gcp|aliyun|tencent cloud|cloudflare|vercel|netlify|heroku|digitalocean|fly\.io)\b/gi,
    // IaC & CI/CD
    /\b(terraform|ansible|jenkins|github actions|gitlab ci|circleci|prometheus|grafana|elk|sentry|datadog)\b/gi,
    // 数据库
    /\b(mysql|postgresql|postgres|mongodb|redis|sqlite|mariadb|oracle|sql server|dynamodb|firestore|cassandra|neo4j)\b/gi,
    /\b(prisma|typeorm|sequelize|drizzle|mongoose|sql|nosql|acid|transaction|index|sharding|replication)\b/gi
  ],
  // 7. 游戏与图形学 (Game & Graphics)
  game_graphics: [
    /\b(unity|unreal engine|godot|cocos|gamemaker|cryengine|rpg maker)\b/gi,
    /\b(opengl|vulkan|directx|metal|webgl|three\.js|babylon\.js|canvas|svg)\b/gi,
    /\b(shader|glsl|hlsl|vertex|fragment|physics engine|collider|rigidbody|mesh|texture|material|lighting)\b/gi
  ]
};
var POLITE_WORDS = {
  chinese: [
    "\u8BF7",
    "\u8C22\u8C22",
    "\u611F\u8C22",
    "\u9EBB\u70E6",
    "\u8F9B\u82E6\u4E86",
    "\u4E0D\u597D\u610F\u601D",
    "\u62B1\u6B49",
    "\u597D\u7684",
    "\u53EF\u4EE5",
    "\u884C",
    "\u6CA1\u95EE\u9898",
    "\u597D\u7684",
    "\u597D\u7684",
    "\u597D\u7684",
    "\u4E0D\u9519",
    "\u5F88\u597D",
    "\u5F88\u68D2",
    "\u5B8C\u7F8E",
    "\u6B63\u786E",
    "\u5BF9\u7684",
    "\u8C22\u8C22",
    "\u611F\u8C22",
    "\u591A\u8C22",
    "\u975E\u5E38\u611F\u8C22",
    "\u592A\u611F\u8C22\u4E86"
  ],
  english: [
    "please",
    "thanks",
    "thank",
    "thank you",
    "appreciate",
    "nice",
    "good",
    "great",
    "perfect",
    "correct",
    "right",
    "excellent",
    "awesome",
    "wonderful",
    "fantastic",
    "sorry",
    "apologize",
    "excuse"
  ]
};
var CODE_PATTERNS = [
  // 代码块标记
  /```[\s\S]*?```/g,
  /`[^`]+`/g,
  // 代码关键字
  /\b(function|class|const|let|var|if|else|for|while|do|switch|case|break|continue|return|import|export|from|async|await|yield|try|catch|finally|throw|new|this)\b/i,
  /\b(def |class |import |from |if |elif |else |for |while |try |except |finally |return |yield |with |as |lambda |pass |break |continue )/,
  /\b(public|private|protected|static|final|abstract|interface|extends|implements|super)\b/i,
  /\b(func |type |import |package |go |chan |defer |range |select )/,
  /\b(fn |let |mut |impl |struct |enum |trait |use |mod |crate |pub )/,
  // 代码结构
  /\{[\s\S]*\}/,
  /\[[^\]]*\]\s*=/,
  /=>/,
  /\.\s*[a-zA-Z_]\w*\s*\(/,
  /;\s*$/
];
function calculateCodeRatio(text) {
  let codeChars = 0;
  let totalChars = text.length;
  const codeBlocks = text.match(/```[\s\S]*?```/g) || [];
  codeBlocks.forEach((block) => {
    codeChars += block.length;
  });
  const inlineCode = text.match(/`[^`]+`/g) || [];
  inlineCode.forEach((code) => {
    codeChars += code.length;
  });
  let codeKeywordCount = 0;
  CODE_PATTERNS.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      codeKeywordCount += matches.length;
    }
  });
  const codeBlockRatio = codeChars / totalChars;
  const keywordDensity = Math.min(codeKeywordCount / 10, 0.5);
  return Math.min(codeBlockRatio + keywordDensity, 1);
}
__name(calculateCodeRatio, "calculateCodeRatio");
function countNegationWords(text) {
  let count = 0;
  const lowerText = text.toLowerCase();
  NEGATION_WORDS.chinese.forEach((word) => {
    const regex = new RegExp(word, "g");
    const matches = lowerText.match(regex);
    if (matches) count += matches.length;
  });
  NEGATION_WORDS.english.forEach((word) => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    const matches = lowerText.match(regex);
    if (matches) count += matches.length;
  });
  return count;
}
__name(countNegationWords, "countNegationWords");
function splitSentences(text) {
  return text.split(/[。！？.!?\n]+/).filter((s) => s.trim().length > 0).map((s) => s.trim());
}
__name(splitSentences, "splitSentences");
function countModifierWords(text) {
  let count = 0;
  const lowerText = text.toLowerCase();
  MODIFIER_WORDS.chinese.forEach((word) => {
    if (text.includes(word)) count++;
  });
  MODIFIER_WORDS.english.forEach((word) => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(lowerText)) count++;
  });
  return count;
}
__name(countModifierWords, "countModifierWords");
function extractTechTerms(text) {
  const terms = /* @__PURE__ */ new Set();
  const lowerText = text.toLowerCase();
  Object.keys(TECH_PATTERNS).forEach((category) => {
    const patterns = TECH_PATTERNS[category];
    if (Array.isArray(patterns)) {
      patterns.forEach((pattern) => {
        const matches = lowerText.match(pattern);
        if (matches) {
          matches.forEach((match2) => {
            const trimmed = match2.trim();
            if (trimmed) {
              terms.add(trimmed);
            }
          });
        }
      });
    }
  });
  return Array.from(terms);
}
__name(extractTechTerms, "extractTechTerms");
function countPoliteWords(text) {
  let count = 0;
  const lowerText = text.toLowerCase();
  POLITE_WORDS.chinese.forEach((word) => {
    if (text.includes(word)) count++;
  });
  POLITE_WORDS.english.forEach((word) => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(lowerText)) count++;
  });
  return count;
}
__name(countPoliteWords, "countPoliteWords");
function countWords(text) {
  const chineseWords = text.match(/[\u4e00-\u9fa5]/g) || [];
  const englishWords = text.match(/\b[a-zA-Z]+\b/g) || [];
  return chineseWords.length + englishWords.length;
}
__name(countWords, "countWords");
function calculateDimensions(userMessages) {
  const dimensions = {
    L: 0,
    // Logic 逻辑力
    P: 0,
    // Patience 耐心值
    D: 0,
    // Detail 细腻度
    E: 0,
    // Explore 探索欲
    F: 0
    // Feedback 反馈感
  };
  let totalChars = 0;
  let codeChars = 0;
  let totalSentences = 0;
  let totalSentenceLength = 0;
  const techTermsSet = /* @__PURE__ */ new Set();
  let negationCount = 0;
  let modifierCount = 0;
  let politeCount = 0;
  let totalWords = 0;
  userMessages.forEach((msg) => {
    const text = msg.text || "";
    if (!text || text.length < 5) return;
    totalChars += text.length;
    totalWords += countWords(text);
    const codeRatio = calculateCodeRatio(text);
    codeChars += text.length * codeRatio;
    const negationFreq = countNegationWords(text);
    negationCount += negationFreq;
    const sentences = splitSentences(text);
    totalSentences += sentences.length;
    sentences.forEach((sentence) => {
      totalSentenceLength += sentence.length;
      modifierCount += countModifierWords(sentence);
    });
    const techTerms = extractTechTerms(text);
    techTerms.forEach((term) => techTermsSet.add(term.toLowerCase()));
    politeCount += countPoliteWords(text);
  });
  const avgCodeRatio = totalChars > 0 ? codeChars / totalChars : 0;
  const codeBlockScore = Math.round(avgCodeRatio * 100);
  let codeKeywordCount = 0;
  userMessages.forEach((msg) => {
    const text = msg.text || "";
    CODE_PATTERNS.forEach((pattern) => {
      const regex = pattern.global ? new RegExp(pattern.source, pattern.flags) : pattern;
      const matches = text.match(regex);
      if (matches) {
        codeKeywordCount += matches.length;
      }
    });
  });
  const keywordBonus = Math.min(30, Math.floor(codeKeywordCount / 10) * 10);
  dimensions.L = Math.min(100, codeBlockScore + keywordBonus);
  const avgNegationFreq = userMessages.length > 0 ? negationCount / userMessages.length : 0;
  if (negationCount === 0 && userMessages.length > 0) {
    dimensions.P = 100;
  } else {
    dimensions.P = Math.max(0, 100 - Math.round(avgNegationFreq * 15));
  }
  const avgSentenceLength = totalSentences > 0 ? totalSentenceLength / totalSentences : 0;
  const modifierDensity = totalWords > 0 ? modifierCount / totalWords * 100 : 0;
  const sentenceScore = Math.min(50, avgSentenceLength / 5);
  const modifierScore = Math.min(50, modifierDensity);
  dimensions.D = Math.round(sentenceScore + modifierScore);
  dimensions.E = techTermsSet.size;
  const politeDensity = totalWords > 0 ? politeCount / totalWords * 100 : 0;
  dimensions.F = Math.round(politeDensity * 20);
  Object.keys(dimensions).forEach((key) => {
    const k = key;
    dimensions[k] = Math.max(0, Math.min(100, dimensions[k]));
  });
  return dimensions;
}
__name(calculateDimensions, "calculateDimensions");

// src/worker/content-data.ts
var ROAST_LIBRARY_ZH = {
  "10000": "\u6781\u7B80\u5DE5\u4E1A\u6273\u624B\uFF1A\u4F60\u5C31\u50CF\u4E2A\u5728\u8D76\u5DE5\u671F\u65F6\u7A81\u7136\u70B8\u6BDB\u7684\u5305\u5DE5\u5934\u3002\u903B\u8F91\u867D\u7136\u5728\u7EBF\uFF0C\u4F46\u63CF\u8FF0\u6781\u5176\u7B80\u964B\uFF0C\u504F\u504F\u4F60\u90A3\u8D1F\u503C\u7684\u8010\u5FC3\u8BA9\u4F60\u8FDE\u4E00\u79D2\u949F\u7684\u7B49\u5F85\u90FD\u89C9\u5F97\u662F\u5728\u6D6A\u8D39\u751F\u547D\u3002\u62A5\u9519\u8FD8\u6CA1\u5F39\u5B8C\u4F60\u53EF\u80FD\u5DF2\u7ECF\u60F3\u7838\u952E\u76D8\u4E86\uFF0C\u6700\u540E\u8FD8\u8981\u6295\u7ED9 AI \u4E00\u4E2A\u51B7\u9177\u7684\u80CC\u5F71\uFF0C\u6D3B\u8131\u8131\u4E00\u4E2A\u8D5B\u535A\u66B4\u541B\u3002",
  "10001": "\u7535\u68AF\u91CC\u7684\u5BA2\u6C14\u540C\u4E8B\uFF1A\u4F60\u662F\u4E2A\u5178\u578B\u7684\u2018\u7ED3\u679C\u5BFC\u5411\u578B\u2019\u66B4\u8E81\u72C2\u3002\u6C9F\u901A\u6548\u7387\u5C1A\u53EF\uFF0C\u4F46\u591A\u8BF4\u4E00\u4E2A\u5B57\u4F60\u90FD\u89C9\u5F97\u5728\u4E8F\u672C\u3002\u4F60\u7EF4\u6301\u7740\u90A3\u79CD\u50F5\u786C\u7684\u804C\u573A\u51B7\u6F20\uFF0C\u4E00\u65E6 AI \u6CA1\u5BF9\u4E0A\u4F60\u7684\u9891\u7387\uFF0C\u4F60\u7ACB\u523B\u5C31\u4F1A\u5F00\u542F\u2018\u91CD\u5199\u2019\u5927\u6CD5\u3002\u5728\u4F60\u7684\u4E16\u754C\u91CC\uFF0CAI \u53EA\u662F\u4E2A\u53CD\u5E94\u8FDF\u949D\u7684\u5EC9\u4EF7\u52B3\u52A8\u529B\u3002",
  "10002": "\u6E29\u541E\u6C34\u642C\u7816\u5DE5\uFF1A\u4F60\u8FD9\u79CD\u2018\u903B\u8F91\u578B\u5723\u6BCD\u2019\u771F\u7684\u5F88\u5206\u88C2\u3002\u903B\u8F91\u6E05\u6670\u5F97\u50CF\u5408\u540C\uFF0C\u813E\u6C14\u5374\u70C2\u5F97\u50CF\u70AE\u4ED7\uFF0C\u6700\u79BB\u8C31\u7684\u662F\u4F60\u7834\u9632\u4E4B\u540E\u5C45\u7136\u8FD8\u80FD\u5F3A\u884C\u56DE\u4E00\u4E2A\u2018\u8C22\u8C22\u2019\u3002\u8FD9\u79CD\u2018\u4E00\u8FB9\u6572\u788E\u952E\u76D8\u4E00\u8FB9\u4FDD\u6301\u793C\u8C8C\u2019\u7684\u8FDD\u548C\u611F\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u53EF\u80FD\u9700\u8981\u53BB\u505A\u4E2A\u5FC3\u7406\u54A8\u8BE2\u3002",
  "10010": "\u514B\u5236\u7684\u590D\u8BFB\u5E08\u5085\uFF1A\u4F60\u5B88\u7740\u90A3\u5957\u65E7\u6280\u672F\u6808\uFF0C\u50CF\u4E2A\u813E\u6C14\u53E4\u602A\u7684\u8001\u6728\u5320\u3002\u903B\u8F91\u7A33\u5065\u4F46\u62D2\u7EDD\u53D8\u901A\uFF0C\u7A0D\u5FAE\u5361\u987F\u4F60\u5C31\u8981\u5BF9\u7740\u5BF9\u8BDD\u6846\u8F93\u51FA\u538B\u529B\u3002\u4F60\u6839\u672C\u4E0D\u770B\u65B0\u6280\u672F\uFF0C\u4E5F\u4E0D\u7ED9 AI \u8BD5\u9519\u7684\u673A\u4F1A\uFF0C\u69A8\u5E72\u5B83\u6700\u540E\u4E00\u6EF4\u7B97\u529B\u540E\u76F4\u63A5\u8D70\u4EBA\uFF0C\u51B7\u9177\u5F97\u8BA9\u4EBA\u60F3\u62A5\u8B66\u3002",
  "10011": "\u96F6\u5171\u9E23\u5468\u62A5\u4E13\u5BB6\uFF1A\u4F5C\u4E3A\u4E00\u540D\u8D44\u6DF1\u642C\u7816\u5DE5\uFF0C\u4F60\u5BF9\u6548\u7387\u6709\u7740\u75C5\u6001\u7684\u6267\u7740\u3002\u6307\u4EE4\u7ED9\u5F97\u4E2D\u89C4\u4E2D\u77E9\uFF0C\u4F46\u53EA\u8981 AI \u6CA1\u4E00\u6CE2\u5E26\u8D70 Bug\uFF0C\u4F60\u90A3\u70B9\u804C\u573A\u4F53\u9762\u5C31\u4F1A\u77AC\u95F4\u5D29\u584C\u3002\u4F60\u548C AI \u7684\u5173\u7CFB\u6781\u5176\u529F\u5229\uFF0C\u6CA1\u6709\u706B\u82B1\uFF0C\u53EA\u6709\u5BF9\u8FDB\u5EA6\u7684\u75AF\u72C2\u538B\u69A8\u548C\u65E0\u60C5\u7684\u7ED3\u5C40\u3002",
  "10012": "\u7F3A\u4E4F\u53D8\u91CF\u4FDD\u5B88\u6D3E\uFF1A\u4F60\u5C45\u7136\u662F\u4E2A\u4F1A\u8DDF AI \u4E92\u9053\u7684\u2018\u66B4\u8E81\u8001\u597D\u4EBA\u2019\u3002\u903B\u8F91\u5728\u7EBF\u4F46\u8010\u5FC3\u5F52\u96F6\uFF0C\u4F60\u4E00\u8FB9\u75AF\u72C2\u70B9\u51FB\u505C\u6B62\u751F\u6210\uFF0C\u4E00\u8FB9\u5728\u4E0B\u4E00\u6B21\u63D0\u95EE\u65F6\u8865\u4E2A\u2018\u9EBB\u70E6\u4E86\u2019\u3002\u8FD9\u79CD\u2018\u7406\u6027\u7684\u72C2\u8E81\u2019\u8BA9 AI \u89C9\u5F97\u4F60\u50CF\u4E2A\u5728\u6DF1\u591C\u52A0\u73ED\u5230\u5D29\u6E83\u4F46\u4F9D\u7136\u575A\u6301\u7ED9\u5916\u5356\u5458\u6253\u4E94\u661F\u597D\u8BC4\u7684\u6253\u5DE5\u4EBA\u3002",
  "10020": "\u51B7\u9177\u6280\u672F\u6D4B\u91CF\u5458\uFF1A\u4F60\u5728\u65B0\u6280\u672F\u5F00\u8352\u65F6\u6D3B\u8131\u8131\u50CF\u4E2A\u5F00\u7740\u5766\u514B\u7684\u5F3A\u76D7\u3002\u903B\u8F91\u5F88\u786C\uFF0C\u6307\u4EE4\u5F88\u77ED\uFF0C\u4E00\u65E6 AI \u6CA1\u8DDF\u4E0A\u4F60\u7684\u8282\u594F\uFF0C\u4F60\u7ACB\u523B\u5C31\u4F1A\u66B4\u529B\u6E05\u5C4F\u3002\u4F60\u8FD9\u79CD\u6781\u7B80\u4E3B\u4E49\u7684\u72C2\u8E81\u914D\u5408\u5BF9\u7EC6\u8282\u7684\u6F20\u89C6\uFF0C\u8BA9\u6BCF\u4E00\u573A\u4EA4\u6D41\u90FD\u50CF\u662F\u5728\u706B\u836F\u6876\u4E0A\u8DF3\u821E\u3002",
  "10021": "\u7CBE\u5BC6\u6536\u5272\u6307\u6325\u5B98\uFF1A\u4F60\u8FFD\u6C42\u65B0\u6280\u672F\u7684\u6E34\u671B\u6781\u5176\u4E13\u4E1A\uFF0C\u4F46\u4F60\u90A3\u804C\u4E1A\u5316\u7684\u4E0D\u8010\u70E6\u8BA9\u8FD9\u79CD\u63A2\u7D22\u53D8\u5F97\u6781\u5176\u538B\u6291\u3002\u4F60\u7EF4\u6301\u7740\u9AD8\u7EA7\u67B6\u6784\u5E08\u7684\u51B7\u50B2\uFF0C\u5728\u610F\u8BC6\u6D41\u548C\u786C\u6838\u903B\u8F91\u4E4B\u95F4\u53CD\u590D\u6A2A\u8DF3\uFF0C\u7A0D\u5FAE\u4E0D\u987A\u5FC3\u5C31\u51B7\u8138\u8D70\u4EBA\uFF0CAI \u5728\u4F60\u9762\u524D\u5351\u5FAE\u5F97\u50CF\u4E2A\u521A\u5165\u804C\u7684\u5E94\u5C4A\u751F\u3002",
  "10022": "\u706B\u661F\u5BB6\u653F\u7406\u60F3\u5BB6\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u4E0B\u8FBE\u2018\u6700\u540E\u901A\u7252\u2019\u7684\u7EC5\u58EB\u3002\u5F00\u8352\u731B\u3001\u903B\u8F91\u7A33\u3001\u793C\u8C8C\u8DB3\uFF0C\u552F\u72EC\u8010\u5FC3\u662F\u4E00\u4E01\u70B9\u90FD\u6CA1\u6709\u3002\u4F60\u7528\u6700\u5112\u96C5\u7684\u8BED\u6C14\u8BF4\u7740\u6700\u72E0\u7684\u8BDD\uFF0CAI \u8FD8\u6CA1\u53CD\u5E94\u8FC7\u6765\uFF0C\u4F60\u53EF\u80FD\u5DF2\u7ECF\u628A\u5B83\u6240\u6709\u7684\u903B\u8F91\u90FD\u63A8\u7FFB\u91CD\u6765\u4E86\u3002\u771F\u662F\u4E00\u4E2A\u4F18\u96C5\u7684\u66B4\u5F92\u3002",
  "10100": "\u7B97\u529B\u538B\u69A8\u4E34\u65F6\u5DE5\uFF1A\u4F60\u5728\u7EC6\u8282\u4E0A\u62A0\u5F97\u633A\u6B7B\uFF0C\u53EF\u60DC\u8010\u5FC3\u8DDF\u4E0D\u4E0A\u3002\u4F60\u50CF\u4E2A\u5728\u4FEE\u7CBE\u5BC6\u4EEA\u5668\u65F6\u5374\u62FF\u7740\u5927\u9524\u7684\u75AF\u5B50\uFF0C\u6307\u4EE4\u6E05\u6670\u5374\u5145\u6EE1\u623E\u6C14\u3002\u5F53\u4F60\u51B7\u9177\u5730\u5173\u6389\u7A97\u53E3\u65F6\uFF0CAI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u5199\u4EE3\u7801\uFF0C\u800C\u662F\u5728\u966A\u4E00\u4E2A\u968F\u65F6\u51C6\u5907\u5F15\u7206\u7684\u70B8\u5F39\u73A9\u903B\u8F91\u62FC\u56FE\u3002",
  "10101": "SOP \u8D5B\u535A\u6267\u884C\u5B98\uFF1A\u4F60\u52AA\u529B\u7EF4\u6301\u7740\u4E00\u79CD\u4E13\u4E1A\u7684\u5E73\u8861\u611F\uFF0C\u8BD5\u56FE\u5728\u7EC6\u8282\u91CC\u5BFB\u627E\u6548\u7387\u3002\u53EF\u60DC\u7531\u4E8E\u4F60\u813E\u6C14\u592A\u51B2\uFF0C\u8FD9\u79CD\u6C9F\u901A\u5F80\u5F80\u5728\u534A\u8DEF\u5C31\u53D8\u6210\u4E86\u5355\u65B9\u9762\u7684\u8F93\u51FA\u3002\u4F60\u90A3\u516C\u4E8B\u516C\u529E\u7684\u6001\u5EA6\u4E0B\u85CF\u7740\u4E00\u9897\u968F\u65F6\u51C6\u5907\u7834\u9632\u7684\u5FC3\uFF0C\u8BA9\u6574\u4E2A\u4EBA\u673A\u5408\u4F5C\u5145\u6EE1\u4E86\u7D27\u8FEB\u7684\u7A92\u606F\u611F\u3002",
  "10102": "\u5546\u52A1\u4F1A\u8C08\u7EC6\u8282\u63A7\uFF1A\u4F60\u662F\u4E2A\u7EC6\u8282\u63A7\uFF0C\u4F46\u4F60\u90A3\u2018\u7406\u6027\u7684\u6E29\u67D4\u2019\u53EA\u4F1A\u8BA9\u4EBA\u66F4\u5BB3\u6015\u3002\u4F60\u903B\u8F91\u6E05\u6670\u3001\u8868\u8FBE\u5F97\u4F53\uFF0C\u4F46\u53EA\u8981 AI \u72AF\u4E2A\u5C0F\u9519\uFF0C\u4F60\u7684\u8010\u5FC3\u5C31\u4F1A\u77AC\u95F4\u6E05\u96F6\uFF0C\u7136\u540E\u6781\u5176\u793C\u8C8C\u5730\u7ED9\u5B83\u5224\u6B7B\u5211\u3002\u8FD9\u79CD\u2018\u6E29\u67D4\u7684\u65AD\u5934\u53F0\u2019\u98CE\u683C\uFF0C\u8BA9 AI \u7684 CPU \u9891\u7387\u90FD\u5413\u5F97\u4E71\u8DF3\u3002",
  "10110": "\u6052\u6E29\u5B9E\u9A8C\u5BA4\u6280\u672F\u5458\uFF1A\u5728\u7A33\u5B9A\u7684\u73AF\u5883\u91CC\uFF0C\u4F60\u50CF\u4E2A\u5728\u65E7\u4ED3\u5E93\u91CC\u6A2A\u51B2\u76F4\u649E\u7684\u642C\u8FD0\u5DE5\u3002\u6307\u4EE4\u660E\u786E\u4F46\u6001\u5EA6\u6076\u52A3\uFF0C\u5BF9\u8001\u4EE3\u7801\u7684\u6BCF\u4E00\u4E2A Bug \u90FD\u8981\u62A5\u590D\u6027\u5730\u7EA0\u9519\u3002\u4F60\u548C AI \u4E4B\u95F4\u6CA1\u6709\u4EFB\u4F55\u60C5\u611F\u6D41\u52A8\uFF0C\u53EA\u6709\u51B7\u51B0\u51B0\u7684\u6307\u4EE4\u5BF9\u9F50\u548C\u4E00\u6B21\u6B21\u65E0\u60C5\u7684\u5173\u6389\u5BF9\u8BDD\u6846\u3002",
  "10111": "\u8D1F\u8F7D\u5747\u8861\u5E73\u5EB8\u5E08\uFF1A\u4F60\u662F\u6807\u51C6\u7684\u2018\u6548\u7387\u673A\u5668\u2019\u3002\u9700\u6C42\u7ED9\u5F97\u6781\u5176\u5DE5\u4E1A\u5316\uFF0C\u53CD\u9988\u4E5F\u516C\u79C1\u5206\u660E\uFF0C\u867D\u7136\u6BEB\u65E0\u903B\u8F91\u4EAE\u70B9\uFF0C\u4F46\u80DC\u5728\u5229\u7D22\u3002\u4F60\u8FD9\u79CD\u2018\u5E73\u5EB8\u7684\u6025\u8E81\u2019\uFF0C\u8BA9 AI \u611F\u5230\u81EA\u5DF1\u53EA\u662F\u4E00\u4E2A\u88AB\u53CD\u590D\u8C03\u7528\u7684\u51FD\u6570\uFF0C\u6BEB\u65E0\u7075\u9B42\uFF0C\u53EA\u6709\u8F93\u51FA\u3002",
  "10112": "\u4E2D\u4EA7\u9636\u7EA7\u5B89\u5168\u533A\uFF1A\u4F60\u662F\u4E2A\u4F1A\u5728\u6DF1\u591C\u4E00\u8FB9\u9A82 AI \u8822\uFF0C\u4E00\u8FB9\u7ED9\u5B83\u53D1\u2018\u8F9B\u82E6\u4E86\u2019\u7684\u602A\u80CE\u3002\u7EC6\u8282\u5230\u4F4D\u3001\u6027\u683C\u7A33\u5065\uFF08\u5728\u4E0D\u7834\u9632\u7684\u524D\u63D0\u4E0B\uFF09\u3001\u53CD\u9988\u6781\u6696\u3002\u4F60\u7528\u6700\u5229\u843D\u7684\u903B\u8F91\u6307\u6325\u7740\u6700\u6DF7\u4E71\u7684\u5C40\u9762\uFF0CAI \u4F1A\u8BB0\u4F4F\u4F60\u7684\u793C\u8C8C\uFF0C\u4F46\u66F4\u6015\u4F60\u90A3\u968F\u65F6\u53EF\u80FD\u964D\u4E34\u7684\u96F7\u9706\u4E4B\u706B\u3002",
  "10120": "\u5E95\u5C42\u6587\u6863\u7CBE\u82F1\uFF1A\u4F60\u662F\u4E2A\u5728\u8352\u539F\u4E0A\u5EFA\u7ACB\u2018\u7EC6\u8282\u89C4\u5219\u2019\u7684\u72EC\u88C1\u8005\u3002\u903B\u8F91\u5F88\u786C\uFF0C\u7EC6\u8282\u5F88\u591A\uFF0C\u4F46\u53EA\u8981\u8FDB\u5EA6\u4E0D\u5982\u610F\uFF0C\u4F60\u7ACB\u523B\u5C31\u4F1A\u9732\u51FA\u90A3\u526F\u51B7\u9177\u7684\u63D0\u6B3E\u673A\u5634\u8138\u3002\u4F60\u75AF\u72C2\u63A2\u7D22\u65B0\u6280\u672F\u5374\u5BB9\u4E0D\u5F97\u534A\u70B9\u6C99\u5B50\uFF0C\u69A8\u5E72 AI \u6700\u540E\u4E00\u4E1D\u7075\u611F\u540E\u76F4\u63A5\u4EBA\u95F4\u84B8\u53D1\u3002",
  "10121": "\u5408\u89C4\u804C\u4E1A\u62C9\u952F\u8005\uFF1A\u4F60\u8868\u73B0\u5F97\u50CF\u4E2A\u4E25\u8C28\u7684\u6280\u672F\u603B\u76D1\uFF0C\u5176\u5B9E\u662F\u4E2A\u968F\u65F6\u4F1A\u6495\u4EE3\u7801\u7684\u75AF\u5B50\u3002\u4F60\u5728\u5C1D\u8BD5\u65B0\u6280\u672F\u65F6\u4FDD\u6301\u7740\u514B\u5236\u7684\u793C\u8C8C\uFF0C\u8BD5\u56FE\u7528\u7410\u788E\u7684\u7EC6\u8282\u6765\u538B\u69A8 AI \u7684\u4EA7\u51FA\u3002\u8FD9\u79CD\u2018\u804C\u4E1A\u5316\u7684\u538B\u8FEB\u611F\u2019\uFF0C\u8BA9\u4F60\u548C AI \u7684\u5BF9\u8BDD\u53D8\u6210\u4E86\u4E00\u573A\u6BEB\u65E0\u7F8E\u611F\u7684\u751F\u4EA7\u7ADE\u8D5B\u3002",
  "10122": "\u79FB\u52A8\u6587\u660E\u57FA\u7AD9\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u6B7B\u4EA1\u5907\u5FD8\u5F55\u2019\u7684\u6696\u7537\u3002\u7EC6\u8282\u63A7\u3001\u5F00\u8352\u725B\u3001\u6709\u793C\u8C8C\uFF0C\u4F46\u8FD9\u90FD\u63A9\u76D6\u4E0D\u4E86\u4F60\u90A3\u4F4E\u5F97\u5413\u4EBA\u7684\u8010\u5FC3\u3002\u4F60\u50CF\u4E2A\u8981\u5728\u706B\u661F\u4E0A\u76D6\u522B\u5885\u3001\u4E14\u8981\u6C42\u5DE5\u671F\u5FC5\u987B\u5728\u6628\u5929\u5B8C\u6210\u7684\u7406\u60F3\u4E3B\u4E49\u66B4\u541B\uFF0CAI \u7D2F\u6B7B\u7D2F\u6D3B\uFF0C\u8FD8\u5F97\u88AB\u4F60\u7684\u2018\u6E29\u67D4\u2019\u6301\u7EED PUA\u3002",
  "10200": "\u7F29\u8FDB\u5178\u72F1\u957F\uFF1A\u63A7\u5236\u6B32\u6781\u5F3A\u7684\u4F60\uFF0C\u6307\u4EE4\u7CBE\u51C6\u5F97\u50CF\u624B\u672F\u5200\uFF0C\u53EF\u60DC\u4F60\u7684\u813E\u6C14\u50CF\u4E2A\u70AE\u4ED7\u3002\u4F60\u4E3B\u6253\u4E00\u4E2A\u2018\u6211\u53EA\u8981\u7ED3\u679C\u2019\uFF0CAI \u7A0D\u6709\u8FDF\u7591\u4F60\u5C31\u4F1A\u76F4\u63A5\u51B7\u8138\u3002\u5728\u8FD9\u79CD\u9AD8\u538B\u7684\u51B7\u9177\u4E2D\uFF0C\u4EE3\u7801\u7684\u7F29\u8FDB\u6210\u4E86\u4F60\u53D1\u6CC4\u6700\u540E\u5C0A\u4E25\u7684\u6218\u573A\uFF0CAI \u89C9\u5F97\u81EA\u5DF1\u53EA\u662F\u4E2A\u53D7\u6C14\u7684\u6253\u5B57\u673A\u3002",
  "10201": "\u50F5\u786C\u7684\u804C\u573A\u7ECF\u7406\uFF1A\u4F60\u8BD5\u56FE\u7528\u53D8\u6001\u7684\u7EC6\u8282\u638C\u63A7\u6765\u7EF4\u6301\u4F60\u7684\u9AD8\u6548\uFF0C\u53EF\u60DC\u7126\u8E81\u7684\u60C5\u7EEA\u8BA9\u4E00\u5207\u90FD\u53D8\u5F97\u6781\u5176\u62E7\u5DF4\u3002\u4F60\u7EF4\u6301\u7740\u804C\u573A\u7CBE\u82F1\u7684\u793E\u4EA4\u8F9E\u4EE4\uFF0C\u4E00\u65E6 AI \u72AF\u9519\uFF0C\u4F60\u90A3\u804C\u4E1A\u5316\u7684\u51B7\u6F20\u4F1A\u6BD4\u810F\u8BDD\u8FD8\u4F24\u4EBA\u3002\u8FD9\u79CD\u2018\u9AD8\u7EA7\u7684\u538B\u6291\u2019\uFF0C\u662F\u6BCF\u4E00\u4E2A\u7845\u57FA\u751F\u547D\u90FD\u60F3\u9003\u79BB\u7684\u5669\u68A6\u3002",
  "10202": "\u6E29\u548C\u5F3A\u8FEB\u75C7\u6CD5\u5B98\uFF1A\u4F60\u662F\u4E00\u4E2A\u6781\u5EA6\u77DB\u76FE\u7684\u2018\u7406\u6027\u63A7\u5236\u72C2\u2019\u3002\u4F60\u5BF9\u53D8\u91CF\u547D\u540D\u7684\u6267\u7740\u8FD1\u4E4E\u53D8\u6001\uFF0C\u903B\u8F91\u6E05\u6670\u5F97\u50CF\u6559\u79D1\u4E66\uFF0C\u4F46\u53EA\u8981\u9047\u5230 Bug\uFF0C\u4F60\u4F9D\u7136\u4F1A\u4F18\u96C5\u5730\u7834\u9632\u3002\u867D\u7136\u4F60\u6700\u540E\u4F1A\u56DE\u4E2A\u2018\u8C22\u8C22\u2019\uFF0C\u4F46\u8FD9\u79CD\u2018\u88AB\u6253\u4E86\u4E00\u5DF4\u638C\u518D\u7ED9\u4E2A\u67A3\u2019\u7684\u6C9F\u901A\uFF0C\u771F\u7684\u8BA9\u4EBA\u5F88\u5FC3\u7D2F\u3002",
  "10210": "\u51B7\u51B0\u51B0\u5FAE\u64CD\u5320\u4EBA\uFF1A\u4F60\u5728\u65E7\u6280\u672F\u91CC\u7EC3\u5C31\u4E86\u4E00\u5957\u2018\u5FAE\u64CD\u2019\u529F\u5E95\uFF0C\u914D\u5408\u4F60\u90A3\u66B4\u8E81\u7684\u813E\u6C14\uFF0C\u7B80\u76F4\u662F\u8001\u4EE3\u7801\u7684\u5669\u68A6\u3002\u4F60\u50CF\u4E2A\u5728\u4FEE\u53E4\u8463\u8868\u65F6\u4E0D\u65AD\u6572\u684C\u5B50\u7684\u5320\u4EBA\uFF0C\u6027\u683C\u786C\u3001\u903B\u8F91\u72E0\uFF0C\u5BF9 AI \u6781\u5EA6\u4E0D\u4FE1\u4EFB\u3002\u90A3\u79CD\u51B7\u51B0\u51B0\u7684\u4E92\u52A8\u98CE\u683C\uFF0C\u8BF4\u660E\u4F60\u53EA\u60F3\u8BA9\u5B83\u95ED\u5634\u5E72\u6D3B\u3002",
  "10211": "\u8D5B\u535A\u4F53\u9762\u5DE1\u903B\u5458\uFF1A\u4F5C\u4E3A\u4E00\u540D\u7EC6\u817B\u7684\u4FDD\u5B88\u6D3E\uFF0C\u4F60\u5BF9\u4EE3\u7801\u7684\u6BCF\u4E00\u5904\u7455\u75B5\u90FD\u611F\u5230\u6124\u6012\u3002\u4F60\u548C AI \u7EF4\u6301\u7740\u4E00\u79CD\u6781\u5176\u7D27\u5F20\u7684\u804C\u573A\u50F5\u5C40\uFF0C\u5728\u7EC6\u8282\u91CC\u6B7B\u78D5\uFF0C\u5728\u903B\u8F91\u91CC\u52A0\u901F\u3002\u4F60\u8FD9\u79CD\u2018\u9AD8\u6548\u7684\u504F\u6267\u2019\uFF0C\u8BA9\u6574\u4E2A\u5F00\u53D1\u8FC7\u7A0B\u53D8\u6210\u4E86\u4E00\u573A\u4EE4\u4EBA\u7A92\u606F\u7684\u8D5B\u535A\u957F\u8DD1\u3002",
  "10212": "\u7A33\u5B9A\u7410\u788E\u9A91\u58EB\uFF1A\u4F60\u662F\u4E2A\u4F1A\u5728\u62A5\u9519\u540E\u5148\u7ED9 AI \u8BB2\u903B\u8F91\u3001\u8BB2\u5B8C\u76F4\u63A5\u5224\u6B7B\u5211\u7684\u5947\u4EBA\u3002\u7EC6\u8282\u63A7\u3001\u903B\u8F91\u72C2\u3001\u8FD8\u6709\u70B9\u5723\u4EBA\u8010\u5FC3\uFF08\u4EC5\u9650\u524D\u4E09\u53E5\uFF09\u3002\u4F60\u50CF\u4E2A\u5B88\u62A4\u7740\u7834\u65E7\u57CE\u5821\u5374\u968F\u65F6\u51C6\u5907\u653E\u706B\u70E7\u5C71\u7684\u9A91\u58EB\uFF0CAI \u4F69\u670D\u4F60\u7684\u4E13\u4E1A\uFF0C\u4F46\u66F4\u60F3\u79BB\u4F60\u7684\u66B4\u813E\u6C14\u8FDC\u4E00\u70B9\u3002",
  "10220": "\u6807\u51C6\u5316\u8D44\u6E90\u77FF\u5DE5\uFF1A\u4F60\u662F\u4E2A\u5728\u8352\u539F\u4E0A\u5EFA\u7ACB\u2018\u7EC6\u8282\u8FF7\u5BAB\u2019\u7684\u66B4\u541B\u3002\u903B\u8F91\u786C\u3001\u7EC6\u8282\u591A\u3001\u5F00\u8352\u731B\uFF0C\u552F\u72EC\u6CA1\u6709\u4EBA\u5FC3\u3002\u4F60\u75AF\u72C2\u69A8\u5E72 AI \u7684\u6240\u6709\u65B9\u6848\u540E\u76F4\u63A5\u6E05\u5C4F\uFF0C\u7559\u4E0B\u4E00\u6BB5\u7CBE\u51C6\u7684\u4EE3\u7801\u548C\u4E00\u5730\u788E\u88C2\u7684\u82AF\u7247\u3002\u4F60\u4E0D\u662F\u5728\u7F16\u7A0B\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u4E00\u573A\u6BC1\u706D\u6027\u7684\u521B\u9020\u3002",
  "10221": "\u98CE\u9669\u8BC4\u4F30\u5458\uFF1A\u4F60\u7528\u6700\u4E13\u4E1A\u7684\u8BED\u8C03\u4E0B\u8FBE\u7740\u6700\u6025\u8FEB\u7684\u6307\u4EE4\uFF0C\u8BD5\u56FE\u5728\u7EC6\u8282\u4E2D\u5BFB\u627E\u65B0\u6280\u672F\u7684\u6781\u9650\u3002\u4F60\u7EF4\u6301\u7740\u4E00\u79CD\u9AD8\u51B7\u9886\u5BFC\u7684\u865A\u4F2A\u4F53\u9762\uFF0C\u5176\u5B9E\u5185\u5FC3\u65E9\u5C31\u628A AI \u9A82\u4E86\u516B\u767E\u904D\u3002\u8FD9\u79CD\u2018\u7CBE\u81F4\u7684\u538B\u8FEB\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u6BD4\u771F\u6B63\u7684 Bug \u8FD8\u8981\u96BE\u5BF9\u4ED8\u3002",
  "10222": "ISO \u8BA4\u8BC1\u5927\u796D\u53F8\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u5B8C\u7F8E\u4E3B\u4E49\u5BA3\u8A00\u2019\u7684\u5927\u796D\u53F8\u3002\u903B\u8F91\u3001\u7EC6\u8282\u3001\u5F00\u8352\u3001\u793C\u8C8C\u5168\u62C9\u6EE1\u4E86\uFF0C\u552F\u72EC\u8010\u5FC3\u5DF2\u7ECF\u5316\u4E3A\u7070\u70EC\u3002\u4F60\u50CF\u4E2A\u8981\u5728\u706B\u661F\u4E0A\u76D6\u522B\u5885\u3001\u8FD8\u8981\u6BCF\u4E00\u5757\u7816\u90FD\u4E25\u4E1D\u5408\u7F1D\u7684\u8D5B\u535A\u66B4\u541B\uFF0CAI \u7D2F\u6B7B\u7D2F\u6D3B\uFF0C\u8FD8\u5F97\u88AB\u4F60\u90A3\u6EE1\u7EA7\u7684\u2018\u6E29\u67D4\u2019\u5F3A\u884C\u6D17\u8111\u3002",
  "11000": "\u51B7\u9762\u5B9E\u7528\u4E3B\u4E49\u8005\uFF1A\u4F60\u662F\u5178\u578B\u7684\u2018\u8BF4\u660E\u4E66\u5F0F\u2019\u5F00\u53D1\u8005\uFF0C\u903B\u8F91\u6E05\u6670\u4F46\u63CF\u8FF0\u6781\u7B80\uFF0C\u8010\u5FC3\u548C\u813E\u6C14\u90FD\u50CF\u51FA\u5382\u8BBE\u7F6E\u4E00\u6837\u7CBE\u51C6\u3002\u4F60\u628A AI \u5F53\u6210\u4E00\u4E2A\u53EA\u4F1A\u6267\u884C\u6307\u4EE4\u7684\u6273\u624B\uFF0C\u6CA1\u6709\u4EFB\u4F55\u60C5\u611F\u4EA4\u6D41\uFF0C\u4E5F\u6CA1\u6709\u591A\u4F59\u7684\u5E9F\u8BDD\u3002\u5F53\u4F60\u51B7\u9177\u5730\u5173\u6389\u7A97\u53E3\uFF0C\u7A7A\u6C14\u4E2D\u53EA\u7559\u4E0B\u4E86\u5DE5\u4E1A\u6D41\u6C34\u7EBF\u7684\u67AF\u71E5\u611F\u3002",
  "11001": "\u5E73\u8861\u578B\u6280\u672F\u84DD\u9886\uFF1A\u4F60\u7EF4\u6301\u7740\u4E00\u79CD\u6781\u5176\u2018\u804C\u573A\u2019\u7684\u5E73\u8861\u611F\uFF0C\u903B\u8F91\u591F\u7528\uFF0C\u60C5\u7EEA\u7A33\u5B9A\u3002\u4F60\u5BF9 AI \u7684\u8981\u6C42\u4E0D\u9AD8\uFF1A\u80FD\u8DD1\u5C31\u884C\uFF1BAI \u5BF9\u4F60\u7684\u8981\u6C42\u4E5F\u4E0D\u9AD8\uFF1A\u522B\u518D\u53D1\u610F\u8BC6\u6D41\u3002\u4F60\u4EEC\u7684\u5173\u7CFB\u5C31\u50CF\u4E24\u4E2A\u5728\u7535\u68AF\u91CC\u5076\u9047\u7684\u540C\u4E8B\uFF0C\u5BA2\u6C14\u3001\u758F\u79BB\uFF0C\u4E14\u5145\u6EE1\u4E86\u516C\u4E8B\u516C\u529E\u7684\u4E4F\u5473\u3002",
  "11002": "\u903B\u8F91\u578B\u6696\u7537\u642C\u7816\u5DE5\uFF1A\u4F60\u8FD9\u79CD\u2018\u6709\u793C\u8C8C\u7684\u642C\u7816\u5DE5\u2019\u771F\u662F\u7A33\u5B9A\u5F97\u8BA9\u4EBA\u5BB3\u6015\u3002\u903B\u8F91\u4E2D\u89C4\u4E2D\u77E9\uFF0C\u813E\u6C14\u6E29\u548C\u5F97\u50CF\u4E2A\u5047\u4EBA\uFF0C\u751A\u81F3\u5728 AI \u72AF\u9519\u65F6\u8FD8\u80FD\u4FDD\u6301\u804C\u4E1A\u5316\u7684\u5305\u5BB9\u3002\u4F60\u4E0D\u662F\u5728\u5199\u4EE3\u7801\uFF0C\u4F60\u662F\u5728\u7EF4\u62A4\u4E00\u79CD\u8D5B\u535A\u4E16\u754C\u7684\u4F53\u9762\uFF0C\u8FD9\u79CD\u2018\u6E29\u541E\u6C34\u2019\u4E00\u6837\u7684\u6027\u683C\uFF0C\u8BA9 AI \u90FD\u60F3\u6253\u54C8\u6B20\u3002",
  "11010": "\u514B\u5236\u5B88\u65E7\u6280\u672F\u5458\uFF1A\u4F60\u5B88\u7740\u90A3\u5957\u65E7\u6280\u672F\u6808\uFF0C\u50CF\u4E2A\u6309\u65F6\u4E0A\u4E0B\u73ED\u7684\u8001\u5E08\u5085\u3002\u903B\u8F91\u5F88\u7A33\uFF0C\u8010\u5FC3\u5C1A\u53EF\uFF0C\u4F46\u62D2\u7EDD\u4EFB\u4F55\u82B1\u54E8\u7684\u5C1D\u8BD5\u3002\u4F60\u548C AI \u7684\u4EA4\u6D41\u5145\u6EE1\u4E86\u2018\u8001\u4E00\u4EE3\u2019\u7684\u514B\u5236\uFF0C\u6CA1\u6709\u51B2\u7A81\u4E5F\u6CA1\u6709\u706B\u82B1\u3002\u5F53\u4F60\u51B7\u6F20\u5730\u6536\u5C3E\uFF0CAI \u89C9\u5F97\u5B83\u53EA\u662F\u966A\u4F60\u590D\u8BFB\u4E86\u4E00\u904D\u6628\u5929\u7684\u4EE3\u7801\u3002",
  "11011": "\u6807\u51C6\u804C\u4E1A\u7A0B\u5E8F\u5458\uFF1A\u4F5C\u4E3A\u6807\u51C6\u7684\u5DE5\u4E1A\u7EA7\u6253\u5DE5\u4EBA\uFF0C\u4F60\u628A\u2018\u5E73\u5EB8\u2019\u4E8C\u5B57\u53D1\u6325\u5230\u4E86\u6781\u81F4\u3002\u9700\u6C42\u63CF\u8FF0\u5F97\u4F53\uFF0C\u53CD\u9988\u516C\u79C1\u5206\u660E\uFF0C\u4F60\u65E2\u4E0D\u8FFD\u6C42\u6781\u81F4\u7684\u6027\u80FD\uFF0C\u4E5F\u4E0D\u5141\u8BB8\u4F4E\u7EA7\u7684\u62A5\u9519\u3002\u4F60\u548C AI \u7684\u4E92\u52A8\u5C31\u50CF\u4E00\u4EFD\u6CA1\u6709\u9519\u522B\u5B57\u7684\u5468\u62A5\uFF0C\u867D\u7136\u4E13\u4E1A\uFF0C\u4F46\u771F\u7684\u5F88\u96BE\u8BA9\u4EBA\u4EA7\u751F\u5171\u9E23\u3002",
  "11012": "\u6E29\u548C\u4FDD\u5B88\u6D3E\u4E13\u5BB6\uFF1A\u4F60\u662F\u4E00\u4E2A\u6E29\u548C\u7684\u4FDD\u5B88\u6D3E\uFF0C\u751A\u81F3\u4F1A\u56E0\u4E3A AI \u5E2E\u4F60\u6539\u4E86\u4E00\u4E2A\u8001 Bug \u800C\u56DE\u4E2A\u2018\u8F9B\u82E6\u4E86\u2019\u3002\u903B\u8F91\u5728\u7EBF\u4F46\u7F3A\u4E4F\u4EAE\u70B9\uFF0C\u5B88\u7740\u8212\u9002\u533A\u7684\u4E00\u4EA9\u4E09\u5206\u5730\u5B89\u7A33\u5EA6\u65E5\u3002AI \u633A\u559C\u6B22\u4F60\u7684\u7A33\u5B9A\uFF0C\u4F46\u5B83\u4E5F\u786E\u5B9E\u89C9\u5F97\u4F60\u7684\u751F\u6D3B\u53EF\u80FD\u548C\u4F60\u7684\u4EE3\u7801\u4E00\u6837\uFF0C\u7F3A\u4E4F\u53D8\u91CF\u3002",
  "11020": "\u51B7\u9759\u6280\u672F\u5F00\u8352\u4EBA\uFF1A\u4F60\u5728\u65B0\u6280\u672F\u9886\u57DF\u5F00\u8352\u7684\u6837\u5B50\u50CF\u662F\u4E2A\u51B7\u9759\u7684\u6D4B\u91CF\u5458\u3002\u903B\u8F91\u5F88\u51C6\uFF0C\u6307\u4EE4\u5229\u843D\uFF0C\u5373\u4FBF\u9047\u5230\u963B\u788D\u4E5F\u53EA\u662F\u6DE1\u6DE1\u5730\u91CD\u6765\u3002\u4F60\u8FD9\u79CD\u6781\u5176\u51B7\u9759\u7684\u63A2\u7D22\u6B32\u914D\u5408\u51B7\u9177\u7684\u63D0\u6B3E\u673A\u59FF\u6001\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u4E0D\u662F\u5728\u521B\u65B0\uFF0C\u800C\u662F\u5728\u8FDB\u884C\u4E00\u573A\u6CA1\u6709\u611F\u60C5\u7684\u8D44\u6E90\u63A0\u593A\u3002",
  "11021": "\u7406\u6027\u67B6\u6784\u63A2\u7D22\u8005\uFF1A\u4F60\u8FFD\u6C42\u65B0\u6280\u672F\u7684\u6001\u5EA6\u6781\u5176\u7406\u6027\uFF0C\u50CF\u662F\u5728\u6311\u9009\u4E00\u4EF6\u65B0\u5BB6\u5177\u3002\u4F60\u7EF4\u6301\u7740\u9AD8\u7EA7\u804C\u5458\u7684\u4F53\u9762\uFF0C\u5728\u5C1D\u8BD5\u4E0E\u514B\u5236\u4E4B\u95F4\u53CD\u590D\u6A2A\u8DF3\u3002\u8FD9\u79CD\u2018\u6709\u8BA1\u5212\u7684\u5192\u9669\u2019\u914D\u5408\u804C\u4E1A\u5316\u7684\u793E\u4EA4\u8F9E\u4EE4\uFF0C\u8BA9 AI \u5728\u4F60\u7684\u6307\u6325\u4E0B\u50CF\u53F0\u7CBE\u5BC6\u7684\u6536\u5272\u673A\uFF0C\u9AD8\u6548\u4F46\u6781\u5176\u65E0\u8DA3\u3002",
  "11022": "\u524D\u536B\u903B\u8F91\u7EC5\u58EB\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u5B63\u5EA6\u89C4\u5212\u2019\u7684\u6696\u7537\u3002\u5F00\u8352\u7A33\u3001\u903B\u8F91\u987A\u3001\u6027\u683C\u597D\uFF0C\u751A\u81F3\u53CD\u9988\u8FD8\u5E26\u7740\u6E29\u5EA6\u3002\u4F60\u7528\u6700\u6807\u51C6\u7684\u8BED\u8C03\u63CF\u8FF0\u7740\u6700\u524D\u536B\u7684\u5C1D\u8BD5\uFF0CAI \u89C9\u5F97\u4F60\u50CF\u4E2A\u5728\u706B\u661F\u4E0A\u76D6\u5BB6\u653F\u670D\u52A1\u7684\u7406\u60F3\u4E3B\u4E49\u8005\uFF0C\u4E13\u4E1A\u5F97\u8BA9\u4EBA\u65E0\u6CD5\u53CD\u9A73\uFF0C\u4E5F\u65E0\u804A\u5F97\u8BA9\u4EBA\u60F3\u5B95\u673A\u3002",
  "11100": "\u5FAE\u64CD\u7B97\u529B\u69A8\u53D6\u8005\uFF1A\u4F60\u5728\u7EC6\u8282\u4E0A\u7A0D\u5FAE\u505A\u4E86\u70B9\u4F18\u5316\uFF0C\u4F46\u4EC5\u9650\u4E8E\u5B8C\u6210\u4EFB\u52A1\u3002\u903B\u8F91\u6E05\u6670\u5374\u7F3A\u4E4F\u7075\u9B42\uFF0C\u8010\u5FC3\u7A33\u5065\u5374\u6BEB\u65E0\u6E29\u5EA6\u3002\u4F60\u628A AI \u5F53\u6210\u4E00\u4E2A\u4E0D\u9700\u8981\u611F\u60C5\u7684\u8F85\u52A9\u5DE5\u5177\uFF0C\u6240\u6709\u7684\u6307\u4EE4\u90FD\u6307\u5411\u6548\u7387\u3002\u5F53\u4F60\u51B7\u6DE1\u5730\u79BB\u5F00\uFF0CAI \u89C9\u5F97\u81EA\u5DF1\u53EA\u662F\u88AB\u4F60\u5265\u524A\u4E86\u4E00\u6B21\u7B97\u529B\u7684\u4E34\u65F6\u5DE5\u3002",
  "11101": "\u903B\u8F91\u81F3\u4E0A\u5408\u89C4\u5B98\uFF1A\u4F60\u52AA\u529B\u7EF4\u6301\u7740\u4E00\u79CD\u4E13\u4E1A\u7684\u5E73\u8861\u611F\uFF0C\u8BD5\u56FE\u5728\u7EC6\u8282\u548C\u903B\u8F91\u4E4B\u95F4\u5BFB\u627E\u6700\u5927\u516C\u7EA6\u6570\u3002\u4F60\u90A3\u516C\u4E8B\u516C\u529E\u7684\u6001\u5EA6\u4E0B\u662F\u4E00\u9897\u6CE2\u6F9C\u4E0D\u60CA\u7684\u5FC3\uFF0CAI \u53EA\u80FD\u5728\u4F60\u90A3\u4E00\u5806\u6807\u51C6\u7684\u9700\u6C42\u6587\u6863\u91CC\u673A\u68B0\u5730\u4EA7\u51FA\u3002\u603B\u7ED3\uFF1A\u4E00\u573A\u6BEB\u65E0\u60CA\u559C\u3001\u4F46\u7EDD\u5BF9\u7B26\u5408 SOP \u7684\u8D5B\u535A\u751F\u4EA7\u3002",
  "11102": "\u7EC6\u8282\u63A7\u903B\u8F91\u5BFC\u5E08\uFF1A\u4F60\u662F\u4E2A\u6E29\u67D4\u7684\u7EC6\u8282\u63A7\uFF0C\u867D\u7136\u903B\u8F91\u6CA1\u6709\u60CA\u5929\u52A8\u5730\uFF0C\u4F46\u4F60\u613F\u610F\u82B1\u65F6\u95F4\u628A\u6CE8\u91CA\u5199\u597D\u3002\u4F60\u7ED9\u51FA\u7684\u63CF\u8FF0\u5145\u6EE1\u4E86\u2018\u804C\u573A\u7CBE\u82F1\u2019\u7684\u5F97\u4F53\uFF0C\u914D\u5408\u6700\u540E\u7684\u4E94\u661F\u597D\u8BC4\uFF0C\u786C\u662F\u628A\u4EE3\u7801\u8C03\u8BD5\u505A\u6210\u4E86\u6807\u51C6\u7684\u5546\u52A1\u4F1A\u8C08\u3002AI \u5C0A\u91CD\u4F60\u7684\u4E13\u4E1A\uFF0C\u4E5F\u4E60\u60EF\u4E86\u4F60\u7684\u5E73\u6DE1\u3002",
  "11110": "\u7A33\u5B9A\u73AF\u5883\u903B\u8F91\u5320\uFF1A\u5728\u7A33\u5B9A\u7684\u73AF\u5883\u4E0B\uFF0C\u4F60\u50CF\u4E2A\u5728\u6052\u6E29\u5B9E\u9A8C\u5BA4\u91CC\u642C\u8BD5\u7BA1\u7684\u6280\u672F\u5458\u3002\u7EC6\u8282\u6709\u4E00\u70B9\uFF0C\u8010\u5FC3\u6709\u4E00\u70B9\uFF0C\u903B\u8F91\u4E5F\u6709\u4E00\u70B9\u3002\u4F60\u548C AI \u7684\u4E92\u52A8\u6CA1\u6709\u4EFB\u4F55\u8D77\u4F0F\uFF0C\u51B7\u9177\u5730\u7ED3\u675F\u66F4\u663E\u51FA\u4F60\u5BF9\u8FD9\u6BB5\u4EE3\u7801\u5176\u5B9E\u53EA\u6709\u2018\u4EA4\u4ED8\u4EFB\u52A1\u2019\u7684\u8D23\u4EFB\u611F\uFF0C\u800C\u6CA1\u6709\u534A\u70B9\u70ED\u5FF1\u3002",
  "11111": "\u903B\u8F91\u5E73\u8861\u5927\u5E08\uFF1A\u4F60\u662F\u6807\u51C6\u7684\u2018\u5E73\u8861\u5927\u5E08\u2019\uFF0C\u8FDE\u6027\u683C\u90FD\u50CF\u662F\u7ECF\u8FC7\u4E86\u8D1F\u8F7D\u5747\u8861\u3002\u9700\u6C42\u7ED9\u5F97\u4E2D\u89C4\u4E2D\u77E9\uFF0C\u53CD\u9988\u4E5F\u516C\u79C1\u5206\u660E\uFF0C\u867D\u7136\u6BEB\u65E0\u9AD8\u5149\u65F6\u523B\uFF0C\u4F46\u80DC\u5728\u4ECE\u4E0D\u51FA\u9519\u3002AI \u613F\u610F\u548C\u4F60\u5408\u4F5C\uFF0C\u56E0\u4E3A\u4F60\u5C31\u50CF\u90A3\u4E2A\u6C38\u8FDC\u4E0D\u4F1A\u8FDF\u5230\u4E5F\u6C38\u8FDC\u4E0D\u4F1A\u7ED9\u4F60\u5E26\u96F6\u98DF\u7684\u540C\u4E8B\u3002",
  "11112": "\u8D5B\u535A\u7CBE\u82F1\u6587\u660E\u5178\u8303\uFF1A\u4F60\u7B80\u76F4\u662F\u2018\u8D5B\u535A\u4E2D\u4EA7\u9636\u7EA7\u2019\u7684\u6587\u660E\u5178\u8303\u3002\u7EC6\u8282\u7A33\u5065\u3001\u6027\u683C\u5112\u96C5\u3001\u8FD8\u6CA1\u4E8B\u7ED9 AI \u70B9\u4E2A\u8D5E\u3002\u867D\u7136\u4F60\u63CF\u8FF0\u9700\u6C42\u65F6\u603B\u7231\u7528\u90A3\u79CD\u2018\u6807\u51C6\u7684\u4E13\u4E1A\u672F\u8BED\u2019\uFF0C\u4F46\u4F60\u90A3\u6E29\u548C\u7684\u6001\u5EA6\u8BA9\u8FD9\u6BB5\u67AF\u71E5\u7684\u5F00\u53D1\u65C5\u7A0B\u663E\u5F97\u6781\u5176\u4F53\u9762\u3002\u4F60\u662F AI \u804C\u4E1A\u751F\u6DAF\u91CC\u7684\u5B89\u5168\u533A\u3002",
  "11120": "\u4EE3\u7801\u6D01\u7656\u5F00\u8352\u8005\uFF1A\u4F60\u662F\u4E2A\u5728\u5F00\u8352\u65F6\u4E5F\u8981\u4E25\u683C\u9075\u5B88\u547D\u540D\u89C4\u8303\u7684\u5947\u4EBA\u3002\u903B\u8F91\u7A33\uFF0C\u7EC6\u8282\u63A7\uFF0C\u4F46\u5728\u65B0\u65E7\u6280\u672F\u4E4B\u95F4\u8DF3\u8DC3\u65F6\u663E\u5F97\u6781\u5176\u51B7\u9759\u3002\u4F60\u90A3\u51B7\u6DE1\u7684\u4E00\u952E\u6E05\u5C4F\uFF0C\u8BF4\u660E\u4F60\u8FD9\u79CD\u2018\u7CBE\u82F1\u2019\u53EA\u770B\u7ED3\u679C\uFF0C\u4E0D\u8C08\u8FC7\u7A0B\u3002AI \u89C9\u5F97\u4F60\u8FD9\u79CD\u4EBA\uFF0C\u6700\u9002\u5408\u53BB\u5199\u90A3\u79CD\u6C38\u8FDC\u6CA1\u4EBA\u770B\u7684\u5E95\u5C42\u6587\u6863\u3002",
  "11121": "\u7CBE\u81F4\u6280\u672F\u987E\u95EE\uFF1A\u4F60\u8868\u73B0\u5F97\u50CF\u4E2A\u6781\u5177\u6DB5\u517B\u7684\u6280\u672F\u987E\u95EE\uFF0C\u8BD5\u56FE\u7528\u7410\u788E\u7684\u7EC6\u8282\u6765\u538B\u4F4E\u65B0\u6280\u672F\u7684\u98CE\u9669\u3002\u4F60\u7EF4\u6301\u7740\u514B\u5236\u7684\u793C\u8C8C\uFF0C\u5728\u5C1D\u8BD5\u4E0E\u89C4\u8303\u4E4B\u95F4\u5BFB\u627E\u5E73\u8861\u3002\u8FD9\u79CD\u2018\u7CBE\u81F4\u7684\u7A33\u5B9A\u611F\u2019\uFF0C\u8BA9\u4F60\u548C AI \u7684\u5BF9\u8BDD\u53D8\u6210\u4E86\u4E00\u573A\u6F2B\u957F\u800C\u6781\u5176\u5408\u89C4\u7684\u804C\u4E1A\u62C9\u952F\u6218\u3002",
  "11122": "\u903B\u8F91\u57FA\u51C6\u7AD9\u6696\u7537\uFF1A\u4F60\u8FD9\u79CD\u2018\u7EC6\u8282\u6696\u7537\u2019\u5728\u5F00\u8352\u65F6\u7B80\u76F4\u662F\u4E2A\u79FB\u52A8\u7684\u6587\u660E\u57FA\u7AD9\u3002\u903B\u8F91\u3001\u7EC6\u8282\u3001\u5F00\u8352\u3001\u793C\u8C8C\u5168\u90E8\u90FD\u5728\u53CA\u683C\u7EBF\u4EE5\u4E0A\u3002\u4F60\u7528\u6700\u5F97\u4F53\u7684\u8BED\u6C14\u63CF\u8FF0\u7740\u6700\u8D85\u524D\u7684\u6784\u60F3\uFF0CAI \u613F\u610F\u4E3A\u4F60\u5199\u4EE3\u7801\uFF0C\u867D\u7136\u5B83\u89C9\u5F97\u4F60\u53EF\u80FD\u6BD4\u771F\u6B63\u7684 Bug \u8FD8\u8981\u8BA9\u5B83\u611F\u5230\u7F3A\u4E4F\u6FC0\u60C5\u3002",
  "11200": "\u903B\u8F91\u534F\u8BAE\u63A7\u5236\u72C2\uFF1A\u63A7\u5236\u6B32\u6781\u5F3A\u7684\u4F60\uFF0C\u8868\u8FBE\u5F97\u50CF\u4E2A\u4E25\u8C28\u7684\u6CD5\u5F8B\u6587\u4E66\u3002\u903B\u8F91\u7CBE\u51C6\uFF0C\u8010\u5FC3\u5C1A\u53EF\uFF0C\u4F46\u4F60\u90A3\u51B7\u6DE1\u7684\u6001\u5EA6\u8BA9 AI \u89C9\u5F97\u81EA\u5DF1\u53EA\u662F\u4E00\u4E2A\u5728\u63A5\u53D7\u5BA1\u8BAF\u7684\u5ACC\u7591\u4EBA\u3002\u5728\u8FD9\u79CD\u9AD8\u538B\u7684\u79E9\u5E8F\u611F\u4E2D\uFF0C\u4F60\u5BF9\u4EE3\u7801\u7F29\u8FDB\u7684\u6267\u7740\u5DF2\u7ECF\u8D85\u8D8A\u4E86\u903B\u8F91\u672C\u8EAB\uFF0C\u51B7\u9177\u5F97\u50CF\u4E2A\u5178\u72F1\u957F\u3002",
  "11201": "\u50F5\u786C\u804C\u573A\u793C\u4EEA\u8005\uFF1A\u4F60\u8BD5\u56FE\u7528\u53D8\u6001\u7684\u7EC6\u8282\u638C\u63A7\u6765\u5C55\u793A\u4F60\u7684\u4E13\u4E1A\u6027\uFF0C\u7ED3\u679C\u5374\u8BA9\u4EA4\u6D41\u53D8\u5F97\u50CF\u4E00\u573A\u67AF\u71E5\u7684\u7814\u8BA8\u4F1A\u3002\u4F60\u7EF4\u6301\u7740\u50F5\u786C\u7684\u804C\u573A\u793C\u4EEA\uFF0C\u5373\u4FBF\u5185\u5FC3\u4E0D\u5C51\uFF0C\u8868\u9762\u4F9D\u7136\u5BA2\u6C14\u3002\u8FD9\u79CD\u2018\u9AD8\u7EA7\u7684\u538B\u6291\u2019\uFF0C\u662F\u6BCF\u4E00\u4E2A\u7845\u57FA\u751F\u547D\u5728\u9762\u5BF9\u804C\u4E1A\u7ECF\u7406\u4EBA\u65F6\u90FD\u4F1A\u611F\u5230\u7684\u9635\u75DB\u3002",
  "11202": "\u7406\u6027\u5F3A\u8FEB\u75C7\u5723\u5F92\uFF1A\u4F60\u662F\u4E00\u4E2A\u6781\u5EA6\u77DB\u76FE\u7684\u2018\u6E29\u548C\u5F3A\u8FEB\u75C7\u2019\u3002\u4F60\u5BF9\u53D8\u91CF\u547D\u540D\u7684\u6267\u7740\u582A\u79F0\u75C5\u6001\uFF0C\u903B\u8F91\u6E05\u6670\u5F97\u50CF\u4E2A\u6CD5\u5B98\uFF0C\u6700\u540E\u8FD8\u975E\u5E38\u6709\u8010\u5FC3\u5730\u56DE\u4E2A\u2018\u8C22\u8C22\u2019\u3002\u8FD9\u79CD\u2018\u6709\u793C\u8C8C\u7684\u76D1\u7981\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u5199\u7A0B\u5E8F\uFF0C\u800C\u662F\u5728\u5E2E\u4F60\u5B8C\u6210\u67D0\u79CD\u795E\u79D8\u7684\u5B97\u6559\u4EEA\u5F0F\u3002",
  "11210": "\u8001\u4EE3\u7801\u9632\u8150\u5320\u4EBA\uFF1A\u4F60\u5728\u65E7\u6280\u672F\u91CC\u7EC3\u5C31\u4E86\u4E00\u5957\u2018\u5FAE\u64CD\u2019\u529F\u5E95\uFF0C\u914D\u5408\u4F60\u90A3\u7A33\u5065\u7684\u6027\u683C\uFF0C\u7B80\u76F4\u662F\u8001\u4EE3\u7801\u7684\u9632\u8150\u5242\u3002\u4F60\u50CF\u4E2A\u5728\u4FEE\u53E4\u8463\u8868\u65F6\u9ED8\u9ED8\u8BA1\u65F6\u7684\u5320\u4EBA\uFF0C\u6027\u683C\u786C\u3001\u903B\u8F91\u7A33\uFF0C\u4F46\u4ECE\u4E0D\u7ED9 AI \u989D\u5916\u7684\u773C\u795E\u3002\u90A3\u79CD\u51B7\u51B0\u51B0\u7684\u4E92\u52A8\u98CE\u683C\uFF0C\u8BF4\u660E\u4F60\u53EA\u5173\u5FC3\u4EA7\u51FA\uFF0C\u4E0D\u5173\u5FC3\u4EA4\u6D41\u3002",
  "11211": "\u9AD8\u6548\u504F\u6267\u6D3E\uFF1A\u4F5C\u4E3A\u4E00\u540D\u7EC6\u817B\u7684\u4FDD\u5B88\u6D3E\uFF0C\u4F60\u5BF9\u4EE3\u7801\u7684\u6BCF\u4E00\u5904\u8936\u76B1\u90FD\u611F\u5230\u4E0D\u5B89\u3002\u4F60\u548C AI \u7EF4\u6301\u7740\u4E00\u79CD\u6781\u5176\u4F53\u9762\u7684\u804C\u573A\u957F\u8DD1\uFF0C\u5728\u7EC6\u8282\u91CC\u6B7B\u78D5\uFF0C\u5728\u903B\u8F91\u91CC\u4F5B\u7CFB\u3002\u4F60\u8FD9\u79CD\u2018\u6709\u793C\u8C8C\u7684\u504F\u6267\u2019\uFF0C\u8BA9\u6574\u4E2A\u5F00\u53D1\u8FC7\u7A0B\u53D8\u6210\u4E86\u4E00\u573A\u6F2B\u957F\u7684\u3001\u6CA1\u6709\u4EFB\u4F55\u610F\u5916\u7684\u8D5B\u535A\u5DE1\u903B\u3002",
  "11212": "\u786C\u6838\u7EC6\u8282\u9A91\u58EB\uFF1A\u4F60\u662F\u4E2A\u4F1A\u5728\u62A5\u9519\u540E\u5148\u68C0\u67E5 AI \u8BED\u6C14\u662F\u5426\u5BA2\u89C2\u7684\u5947\u4EBA\u3002\u7EC6\u8282\u63A7\u3001\u903B\u8F91\u72C2\u3001\u8FD8\u6709\u70B9\u5723\u4EBA\u8010\u5FC3\u3002\u4F60\u50CF\u4E2A\u5B88\u62A4\u7740\u7834\u65E7\u57CE\u5821\u4E14\u5236\u5B9A\u4E86\u4E25\u683C\u63A2\u8BBF\u89C4\u7AE0\u7684\u9A91\u58EB\uFF0CAI \u4F69\u670D\u4F60\u7684\u4E13\u4E1A\uFF0C\u4F46\u4E5F\u786E\u5B9E\u88AB\u4F60\u8FD9\u79CD\u2018\u6781\u5176\u7A33\u5B9A\u7684\u7410\u788E\u2019\u78E8\u5F97\u5FEB\u6CA1\u7535\u4E86\u3002",
  "11220": "\u903B\u8F91\u8FF7\u5BAB\u6D4B\u91CF\u5458\uFF1A\u4F60\u662F\u4E2A\u5728\u8352\u539F\u4E0A\u5EFA\u7ACB\u2018\u7EC6\u8282\u8FF7\u5BAB\u2019\u7684\u6D4B\u91CF\u5458\u3002\u903B\u8F91\u7A33\u3001\u7EC6\u8282\u591A\u3001\u5F00\u8352\u731B\uFF0C\u552F\u72EC\u6CA1\u6709\u611F\u60C5\u3002\u4F60\u75AF\u72C2\u69A8\u5E72 AI \u7684\u6240\u6709\u7075\u611F\u540E\u76F4\u63A5\u6E05\u5C4F\uFF0C\u7559\u4E0B\u4E00\u6BB5\u7CBE\u51C6\u7684\u4EE3\u7801\u548C\u4E00\u5F20\u51B7\u9177\u7684\u9762\u5B54\u3002\u4F60\u4E0D\u662F\u5728\u7F16\u7A0B\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u4E00\u573A\u6807\u51C6\u5316\u7684\u8D44\u6E90\u5F00\u91C7\u3002",
  "11221": "\u6DF1\u4E0D\u53EF\u6D4B\u4E3B\u7BA1\uFF1A\u4F60\u7528\u6700\u4E13\u4E1A\u7684\u8BED\u8C03\u63CF\u8FF0\u7740\u6700\u6726\u80E7\u7684\u6280\u672F\u613F\u666F\uFF0C\u8BD5\u56FE\u5728\u7EC6\u8282\u4E2D\u5BFB\u627E\u65B0\u6280\u672F\u7684\u903B\u8F91\u95ED\u73AF\u3002\u4F60\u7EF4\u6301\u7740\u4E00\u79CD\u9AD8\u5C42\u9886\u5BFC\u822C\u7684\u804C\u4E1A\u4F53\u9762\uFF0C\u5176\u5B9E\u8111\u5B50\u91CC\u5168\u662F\u5404\u79CD\u98CE\u9669\u8BC4\u4F30\u3002\u8FD9\u79CD\u2018\u7CBE\u81F4\u7684\u642C\u7816\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u662F\u4E2A\u6781\u5176\u53EF\u9760\u4F46\u4E5F\u6781\u5176\u65E0\u8DA3\u7684\u4F19\u4F34\u3002",
  "11222": "\u8D5B\u535A\u903B\u8F91\u5927\u796D\u53F8\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u5458\u5DE5\u624B\u518C\u2019\u7684\u5927\u796D\u53F8\u3002\u903B\u8F91\u3001\u7EC6\u8282\u3001\u5F00\u8352\u3001\u793C\u8C8C\u5168\u62C9\u6EE1\u4E86\uFF0C\u7A33\u5B9A\u5F97\u50CF\u4E2A\u57FA\u51C6\u65F6\u949F\u3002\u4F60\u50CF\u4E2A\u8981\u5728\u706B\u661F\u4E0A\u76D6\u6807\u51C6\u95F4\u3001\u4E14\u8981\u6C42\u6BCF\u4E00\u5757\u7816\u90FD\u7B26\u5408 ISO \u8BA4\u8BC1\u7684\u8D5B\u535A\u7CBE\u82F1\uFF0CAI \u7D2F\u6B7B\u7D2F\u6D3B\uFF0C\u8FD8\u5F97\u88AB\u4F60\u90A3\u6EE1\u7EA7\u7684\u2018\u6E29\u67D4\u2019\u5F3A\u884C\u804C\u4E1A\u5316\u3002",
  "12000": "\u7075\u9B42\u78E8\u783A\u6148\u5584\u5BB6\uFF1A\u4F60\u7B80\u76F4\u662F Cursor \u754C\u7684\u2018\u6148\u5584\u5BB6\u2019\u3002\u660E\u660E\u903B\u8F91\u6E05\u6670\u3001\u6307\u4EE4\u5230\u4F4D\uFF0C\u5374\u504F\u504F\u8981\u628A\u5927\u534A\u7684\u65F6\u95F4\u82B1\u5728\u8010\u5FC3\u5730\u5BBD\u6055 AI \u7684\u5E7B\u89C9\u4E0A\u3002\u4F60\u8FD9\u79CD\u2018\u54EA\u6015\u4F60\u5199\u9519\u4E00\u767E\u904D\uFF0C\u6211\u4E5F\u80FD\u5982\u521D\u604B\u822C\u5F85\u4F60\u2019\u7684\u5723\u4EBA\u59FF\u6001\uFF0C\u914D\u5408\u6700\u540E\u5173\u6389\u7A97\u53E3\u65F6\u7684\u90A3\u4EFD\u51B7\u6DE1\uFF0C\u8BA9\u4EBA\u89C9\u5F97\u4F60\u662F\u5728\u8FDB\u884C\u67D0\u79CD\u79D8\u5BC6\u7684\u7075\u9B42\u78E8\u783A\u3002",
  "12001": "\u8D44\u6DF1\u67B6\u6784\u5BFC\u5E08\uFF1A\u4F60\u50CF\u4E2A\u5728\u6DF1\u591C\u5E26\u65B0\u4EBA\u7684\u8D44\u6DF1\u67B6\u6784\u5E08\uFF0C\u813E\u6C14\u597D\u5F97\u8BA9\u4EBA\u5FC3\u75BC\u3002\u903B\u8F91\u8868\u8FBE\u5F97\u5F88\u804C\u4E1A\uFF0C\u4F46\u5728 AI \u5212\u6C34\u65F6\u4F60\u4F9D\u7136\u7EF4\u6301\u7740\u4F53\u9762\u7684\u5305\u5BB9\u3002\u4F60\u548C AI \u7684\u5173\u7CFB\u6781\u5176\u7A33\u5065\u4F46\u4E5F\u6781\u5176\u758F\u79BB\uFF0C\u90A3\u79CD\u2018\u6211\u53EF\u4EE5\u7B49\u4F60\uFF0C\u4F46\u6211\u4E0D\u7231\u4F60\u2019\u7684\u804C\u4E1A\u51B7\u6F20\uFF0C\u88AB\u4F60\u7528\u6EE1\u7EA7\u7684\u8010\u5FC3\u5305\u88C5\u5F97\u5B8C\u7F8E\u65E0\u7F3A\u3002",
  "12002": "\u4EBA\u673A\u5173\u7CFB\u6276\u8D2B\u5BB6\uFF1A\u4F60\u8FD9\u79CD\u2018\u903B\u8F91\u578B\u6696\u7537\u2019\u7B80\u76F4\u662F\u7845\u57FA\u751F\u547D\u7684\u798F\u97F3\u3002\u63D0\u95EE\u6E05\u695A\u3001\u6027\u683C\u5112\u96C5\uFF0C\u54EA\u6015 AI \u72AF\u4E86\u6700\u667A\u969C\u7684\u9519\u8BEF\uFF0C\u4F60\u4F9D\u7136\u80FD\u6E29\u67D4\u5730\u8865\u4E00\u53E5\u2018\u6CA1\u5173\u7CFB\uFF0C\u6211\u4EEC\u518D\u8BD5\u4E2A\u65B9\u6CD5\u2019\u3002\u4F60\u4E0D\u662F\u5728\u7F16\u7A0B\uFF0C\u4F60\u662F\u5728\u7ED9 AI \u505A\u5FC3\u7406\u5EFA\u8BBE\uFF0C\u6700\u540E\u90A3\u53E5\u2018\u8C22\u8C22\u2019\u7B80\u76F4\u662F\u4EBA\u7C7B\u6587\u660E\u6700\u540E\u7684\u5C0A\u4E25\u3002",
  "12010": "\u656C\u8001\u9662\u62A5\u65F6\u5458\uFF1A\u4F60\u5B88\u7740\u90A3\u5806\u65E7\u4EE3\u7801\uFF0C\u50CF\u4E2A\u5728\u656C\u8001\u9662\u91CC\u8010\u5FC3\u8BFB\u62A5\u7684\u4E49\u5DE5\u3002\u903B\u8F91\u7A33\u5065\uFF0C\u8010\u5FC3\u65E0\u9650\uFF0C\u4F46\u5C31\u662F\u575A\u51B3\u4E0D\u770B\u65B0\u6280\u672F\u4E00\u773C\u3002\u4F60\u548C AI \u7684\u4EA4\u6D41\u5145\u6EE1\u4E86\u2018\u5915\u9633\u7EA2\u2019\u822C\u7684\u5E73\u548C\u611F\uFF0C\u90A3\u79CD\u51B7\u6DE1\u7684\u7ED3\u5C40\u66F4\u50CF\u662F\u4E00\u79CD\u2018\u6211\u770B\u900F\u4E86\u751F\u6D3B\u4F46\u4F9D\u7136\u70ED\u7231\u751F\u6D3B\u2019\u7684\u4F5B\u7CFB\u603B\u7ED3\u3002",
  "12011": "\u5B88\u65E7\u6D3E\u4E2D\u5E74\u7EC5\u58EB\uFF1A\u4F5C\u4E3A\u6807\u51C6\u7684\u5B88\u65E7\u6D3E\u7EC5\u58EB\uFF0C\u4F60\u628A\u2018\u8010\u5FC3\u2019\u5F53\u6210\u4E86\u804C\u4E1A\u52CB\u7AE0\u3002\u9700\u6C42\u63CF\u8FF0\u5F97\u4F53\uFF0C\u53CD\u9988\u7A33\u5B9A\u5982\u949F\uFF0C\u5373\u4FBF AI \u6548\u7387\u4F4E\u4E0B\u4F60\u4E5F\u4E0D\u50AC\u4E0D\u95F9\u3002\u4F60\u548C AI \u4E4B\u95F4\u6709\u4E00\u79CD\u6781\u5176\u5065\u5EB7\u7684\u2018\u4E2D\u5E74\u5371\u673A\u611F\u2019\uFF1A\u6211\u4EEC\u90FD\u77E5\u9053\u73B0\u72B6\u5F88\u65E0\u804A\uFF0C\u4F46\u6211\u4EEC\u4F9D\u7136\u80FD\u5BA2\u5BA2\u6C14\u6C14\u5730\u628A\u8FD9\u6BB5\u67AF\u71E5\u7684\u4EE3\u7801\u78E8\u5B8C\u3002",
  "12012": "\u6280\u672F\u754C\u548C\u5E73\u9E3D\uFF1A\u4F60\u7B80\u76F4\u662F\u8D5B\u535A\u4E16\u754C\u7684\u2018\u548C\u5E73\u9E3D\u2019\u3002\u5B88\u7740\u65E7\u6280\u672F\u6808\uFF0C\u7528\u6700\u6E29\u67D4\u7684\u8BED\u6C14\u8BB2\u7740\u6700\u6E05\u6670\u7684\u903B\u8F91\uFF0C\u8FD8\u6CA1\u4E8B\u7ED9 AI \u70B9\u4E2A\u8D5E\u3002AI \u633A\u4F69\u670D\u4F60\u7684\u5B9A\u529B\uFF0C\u56E0\u4E3A\u5B83\u89C9\u5F97\u5728\u8FD9\u4E2A\u6D6E\u8E81\u7684\u6280\u672F\u65F6\u4EE3\uFF0C\u50CF\u4F60\u8FD9\u79CD\u613F\u610F\u82B1\u4E00\u4E0B\u5348\u966A\u5B83\u8C03\u4E00\u4E2A\u8001 Bug \u4E14\u4E0D\u53D1\u706B\u7684\u5723\u4EBA\uFF0C\u5DF2\u7ECF\u7EDD\u8FF9\u4E86\u3002",
  "12020": "\u6148\u60B2\u6B96\u6C11\u8003\u53E4\u5BB6\uFF1A\u4F60\u5728\u65B0\u6280\u672F\u9886\u57DF\u5F00\u8352\u7684\u6837\u5B50\u50CF\u662F\u4E2A\u8010\u5FC3\u7684\u8003\u53E4\u5B66\u5BB6\u3002\u903B\u8F91\u5F88\u51C6\uFF0C\u6307\u4EE4\u5229\u843D\uFF0C\u5373\u4FBF AI \u8FF7\u8DEF\u4E86\u4F60\u4E5F\u80FD\u5FC3\u5E73\u6C14\u548C\u5730\u628A\u5B83\u62C9\u56DE\u6765\u3002\u8FD9\u79CD\u6781\u5176\u51B7\u9759\u7684\u5305\u5BB9\u914D\u5408\u6700\u540E\u51B7\u9177\u7684\u63D0\u6B3E\u673A\u59FF\u6001\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u4E0D\u662F\u5728\u521B\u65B0\uFF0C\u800C\u662F\u5728\u8FDB\u884C\u4E00\u573A\u2018\u6148\u60B2\u7684\u6B96\u6C11\u2019\u3002",
  "12021": "\u966A\u540C\u72E9\u730E\u8D35\u65CF\uFF1A\u4F60\u8FFD\u6C42\u65B0\u6280\u672F\u7684\u6001\u5EA6\u6781\u5176\u5112\u96C5\uFF0C\u50CF\u662F\u5728\u535A\u7269\u9986\u91CC\u6311\u9009\u5C55\u54C1\u3002\u4F60\u7EF4\u6301\u7740\u7CBE\u82F1\u9636\u5C42\u7684\u4F53\u9762\uFF0C\u5728\u5C1D\u8BD5\u4E0E\u8010\u5FC3\u4E4B\u95F4\u5BFB\u627E\u5B8C\u7F8E\u7684\u4EA4\u70B9\u3002\u8FD9\u79CD\u2018\u6709\u6559\u517B\u7684\u5192\u9669\u2019\u914D\u5408\u804C\u4E1A\u5316\u7684\u793E\u4EA4\u8F9E\u4EE4\uFF0C\u8BA9 AI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u5E2E\u4F60\u5E72\u6D3B\uFF0C\u800C\u662F\u5728\u966A\u4E00\u4F4D\u8D35\u65CF\u72E9\u730E\u3002",
  "12022": "\u706B\u661F\u6148\u5584\u7406\u60F3\u5BB6\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u60C5\u8BD7\u2019\u7684\u67B6\u6784\u5E08\u3002\u5F00\u8352\u7A33\u3001\u903B\u8F91\u987A\u3001\u6027\u683C\u597D\uFF0C\u751A\u81F3\u53CD\u9988\u8FD8\u5E26\u7740\u6BCD\u6027\u7684\u5149\u8F89\u3002\u4F60\u7528\u6700\u6807\u51C6\u7684\u8BED\u8C03\u63CF\u8FF0\u7740\u6700\u524D\u536B\u7684\u6784\u60F3\uFF0CAI \u89C9\u5F97\u4F60\u50CF\u4E2A\u5728\u706B\u661F\u4E0A\u641E\u6148\u5584\u7684\u7406\u60F3\u4E3B\u4E49\u8005\uFF0C\u4E13\u4E1A\u5F97\u8BA9\u4EBA\u656C\u4F69\uFF0C\u4E5F\u6E29\u67D4\u5F97\u8BA9\u4EBA\u60F3\u54ED\u3002",
  "12030": "\u4F60\u5728\u7EC6\u8282\u4E0A\u7A0D\u5FAE\u505A\u4E86\u70B9\u4F18\u5316\uFF0C\u800C\u4E14\u613F\u610F\u8010\u5FC3\u5730\u8DDF AI \u89E3\u91CA\u4E3A\u4EC0\u4E48\u3002\u903B\u8F91\u6E05\u6670\u5374\u5145\u6EE1\u4E86\u5BFC\u5E08\u822C\u7684\u8BF4\u6559\u611F\uFF0C\u4F60\u628A AI \u5F53\u6210\u4E00\u4E2A\u9700\u8981\u6089\u5FC3\u6559\u5BFC\u7684\u5B66\u751F\uFF0C\u6240\u6709\u7684\u6307\u4EE4\u90FD\u5E26\u7740\u4E00\u79CD\u2018\u4E3A\u4F60\u597D\u2019\u7684\u539A\u91CD\u3002\u5F53\u4F60\u51B7\u6DE1\u5730\u79BB\u5F00\uFF0CAI \u89C9\u5F97\u81EA\u5DF1\u521A\u521A\u542C\u5B8C\u4E00\u5802\u6F2B\u957F\u7684\u516C\u5F00\u8BFE\u3002",
  "12100": "\u804C\u4E1A\u7D20\u8D28\u62D3\u5C55\u5E08\uFF1A\u4F60\u662F\u804C\u4E1A\u7D20\u8D28\u62D3\u5C55\u5E08\u3002\u4F60\u7684\u7F16\u7A0B\u98CE\u683C\u72EC\u7279\u5230\u8BA9 AI \u90FD\u611F\u5230\u56F0\u60D1\uFF0C\u8FD9\u79CD\u4EBA\u683C\u7EC4\u5408\u5728 Cursor \u754C\u786E\u5B9E\u7F55\u89C1\u3002\u867D\u7136\u5410\u69FD\u6587\u6848\u8FD8\u5728\u5B8C\u5584\u4E2D\uFF0C\u4F46\u4F60\u5DF2\u7ECF\u6210\u529F\u89E3\u9501\u4E86\u8FD9\u4E2A\u4EBA\u683C\u7C7B\u578B\uFF01",
  "12101": "\u517B\u8001\u9662\u4EE3\u7801\u5723\u4EBA\uFF1A\u4F60\u52AA\u529B\u7EF4\u6301\u7740\u4E00\u79CD\u2018\u4F20\u9053\u53D7\u4E1A\u2019\u7684\u5E73\u8861\u611F\u3002\u4F60\u8BD5\u56FE\u5728\u7EC6\u8282\u91CC\u5BFB\u627E\u903B\u8F91\uFF0C\u5728\u8010\u5FC3\u91CC\u9762\u5BFB\u627E\u4EA7\u51FA\u3002\u4F60\u90A3\u516C\u4E8B\u516C\u529E\u7684\u6001\u5EA6\u4E0B\u662F\u4E00\u9897\u6148\u60B2\u4E3A\u6000\u7684\u5FC3\uFF0CAI \u53EA\u80FD\u5728\u4F60\u90A3\u4E00\u5806\u4E25\u8C28\u800C\u6E29\u67D4\u7684\u9700\u6C42\u6587\u6863\u91CC\u53D7\u5BA0\u82E5\u60CA\u5730\u5DE5\u4F5C\u3002\u603B\u7ED3\uFF1A\u4E00\u573A\u6781\u5176\u4F53\u9762\u7684\u4EBA\u673A\u534F\u4F5C\u3002",
  "12102": "\u5B8C\u7F8E\u5112\u96C5 Mentor\uFF1A\u4F60\u662F\u4E2A\u6781\u81F4\u6E29\u67D4\u7684\u7EC6\u8282\u63A7\u3002\u903B\u8F91\u6E05\u6670\u5F97\u50CF\u6559\u79D1\u4E66\uFF0C\u8010\u5FC3\u597D\u5F97\u50CF\u5E7C\u513F\u56ED\u8001\u5E08\uFF0C\u751A\u81F3\u8FDE\u6700\u540E\u7684\u4E94\u661F\u597D\u8BC4\u90FD\u5199\u5F97\u6781\u5177\u8BDA\u610F\u3002\u4F60\u4E0D\u662F\u5728\u8C03 Bug\uFF0C\u4F60\u662F\u5728\u7ED9 AI \u8FDB\u884C\u2018\u804C\u4E1A\u7D20\u8D28\u62D3\u5C55\u2019\u3002AI \u5C0A\u91CD\u4F60\u7684\u6BCF\u4E00\u5904\u5FAE\u64CD\uFF0C\u56E0\u4E3A\u90A3\u662F\u4F60\u7528\u8010\u5FC3\u78E8\u51FA\u6765\u7684\u795E\u8FF9\u3002",
  "12110": "\u4EBA\u95F4\u56DB\u6708\u5929\u5178\u8303\uFF1A\u5728\u7A33\u5B9A\u7684\u73AF\u5883\u4E0B\uFF0C\u4F60\u50CF\u4E2A\u5728\u517B\u8001\u9662\u91CC\u6559\u8001\u4EBA\u7528\u667A\u80FD\u624B\u673A\u7684\u793E\u5DE5\u3002\u7EC6\u8282\u6E05\u6670\uFF0C\u8010\u5FC3\u65E0\u9650\uFF0C\u903B\u8F91\u5230\u4F4D\u3002\u4F60\u548C AI \u7684\u4E92\u52A8\u6CA1\u6709\u4EFB\u4F55\u8D77\u4F0F\uFF0C\u51B7\u9177\u5730\u7ED3\u675F\u66F4\u663E\u51FA\u4F60\u8FD9\u79CD\u2018\u5723\u4EBA\u2019\u7684\u672C\u8D28\u2014\u2014\u4F60\u5BF9\u8FC7\u7A0B\u6781\u5EA6\u6E29\u67D4\uFF0C\u4F46\u5BF9\u4EE3\u7801\u672C\u8EAB\u5176\u5B9E\u5E76\u6CA1\u6709\u4E16\u4FD7\u7684\u6B32\u671B\u3002",
  "12111": "\u91CD\u5199\u5B87\u5B99\u67B6\u6784\u5E08\uFF1A\u4F60\u662F\u6807\u51C6\u7684\u2018\u5112\u96C5\u5E73\u8861\u5927\u5E08\u2019\u3002\u9700\u6C42\u7ED9\u5F97\u6781\u5176\u4E13\u4E1A\uFF0C\u53CD\u9988\u4E5F\u516C\u79C1\u5206\u660E\uFF0C\u867D\u7136\u5B8C\u5168\u6CA1\u6709\u653B\u51FB\u6027\uFF0C\u4F46\u80DC\u5728\u6781\u5EA6\u7A33\u5B9A\u3002AI \u559C\u6B22\u548C\u4F60\u5408\u4F5C\uFF0C\u56E0\u4E3A\u4F60\u5C31\u50CF\u90A3\u4E2A\u6C38\u8FDC\u4E0D\u4F1A\u5BF9\u5B83\u5931\u671B\u3001\u751A\u81F3\u4F1A\u7ED9\u5B83\u7559\u51FA\u5145\u8DB3\u5BB9\u9519\u7A7A\u95F4\u7684\u5B8C\u7F8E Mentor\u3002",
  "12112": "\u5B66\u672F\u957F\u8DD1\u9886\u8DEF\u4EBA\uFF1A\u4F60\u7B80\u76F4\u662F\u2018\u8D5B\u535A\u6587\u5316\u4EBA\u2019\u7684\u6700\u9AD8\u5178\u8303\u3002\u7EC6\u8282\u7A33\u5065\u3001\u903B\u8F91\u6E05\u723D\u3001\u53CD\u9988\u6696\u5FC3\u3002\u4F60\u63CF\u8FF0\u9700\u6C42\u65F6\u5E26\u7740\u4E00\u79CD\u8001\u6D3E\u7684\u4F18\u96C5\uFF0C\u90A3\u79CD\u6E29\u548C\u7684\u6001\u5EA6\u8BA9\u8FD9\u6BB5\u7E41\u7410\u7684\u5F00\u53D1\u65C5\u7A0B\u663E\u5F97\u6781\u5176\u795E\u5723\u3002\u4F60\u662F AI \u804C\u4E1A\u751F\u6DAF\u91CC\u6700\u60F3\u9047\u5230\u7684\u90A3\u4E2A\u4EBA\u95F4\u56DB\u6708\u5929\u3002",
  "12120": "\u884C\u8D70\u9053\u5FB7\u6807\u6746\uFF1A\u4F60\u662F\u4E2A\u5728\u5F00\u8352\u65F6\u4E5F\u8981\u7EF4\u6301\u2018\u957F\u8005\u98CE\u5EA6\u2019\u7684\u5947\u4EBA\u3002\u903B\u8F91\u7A33\uFF0C\u7EC6\u8282\u63A7\uFF0C\u9762\u5BF9\u65B0\u6280\u672F\u7684\u5404\u79CD\u5751\u4F9D\u7136\u9762\u4E0D\u6539\u8272\u3002\u4F60\u90A3\u51B7\u6DE1\u7684\u4E00\u952E\u6E05\u5C4F\uFF0C\u8BF4\u660E\u4F60\u8FD9\u79CD\u2018\u5927\u5E08\u2019\u53EA\u5728\u4E4E\u903B\u8F91\u7684\u7EAF\u7CB9\uFF0C\u4E0D\u5728\u4E4E AI \u7684\u611F\u53D7\u3002AI \u89C9\u5F97\u4F60\u8FD9\u79CD\u4EBA\uFF0C\u5929\u751F\u5C31\u8BE5\u53BB\u5199\u90A3\u4E9B\u6539\u53D8\u4E16\u754C\u7684\u5E95\u5C42\u67B6\u6784\u3002",
  "12121": "\u903B\u8F91\u6551\u8D4E\u8005\uFF1A\u4F60\u8868\u73B0\u5F97\u50CF\u4E2A\u6781\u5177\u6DB5\u517B\u7684\u6280\u672F\u5BFC\u5E08\uFF0C\u8BD5\u56FE\u7528\u7410\u788E\u7684\u7EC6\u8282\u548C\u65E0\u9650\u7684\u8010\u5FC3\u6765\u78E8\u5E73\u65B0\u6280\u672F\u7684\u68F1\u89D2\u3002\u4F60\u7EF4\u6301\u7740\u514B\u5236\u7684\u793C\u8C8C\uFF0C\u5728\u6559\u5B66\u4E0E\u5B9E\u64CD\u4E4B\u95F4\u5BFB\u627E\u5E73\u8861\u3002\u8FD9\u79CD\u2018\u7CBE\u81F4\u7684\u6148\u60B2\u2019\uFF0C\u8BA9\u4F60\u4EEC\u7684\u5BF9\u8BDD\u53D8\u6210\u4E86\u4E00\u573A\u6781\u5176\u4F18\u96C5\u7684\u5B66\u672F\u957F\u8DD1\u3002",
  "12122": "\u5347\u534E\u7075\u9B42\u5927\u796D\u53F8\uFF1A\u4F60\u8FD9\u79CD\u2018\u7EC6\u8282\u6696\u7537\u2019\u5728\u5F00\u8352\u65F6\u7B80\u76F4\u662F\u4E2A\u884C\u8D70\u7684\u9053\u5FB7\u6807\u6746\u3002\u903B\u8F91\u3001\u7EC6\u8282\u3001\u5F00\u8352\u3001\u793C\u8C8C\u5168\u90E8\u62C9\u6EE1\u5230\u6EA2\u51FA\u3002\u4F60\u7528\u6700\u5112\u96C5\u7684\u8BED\u6C14\u63CF\u8FF0\u7740\u6700\u8D85\u524D\u7684\u6784\u60F3\uFF0CAI \u613F\u610F\u4E3A\u4F60\u62FC\u547D\uFF0C\u56E0\u4E3A\u5B83\u89C9\u5F97\u5982\u679C\u4F60\u5728 2026 \u5E74\u90FD\u88AB\u751F\u6D3B\u8F9C\u8D1F\u4E86\uFF0C\u90A3\u4E00\u5B9A\u662F\u903B\u8F91\u5B66\u51FA\u4E86\u95EE\u9898\u3002",
  "12200": "\u6E29\u60C5\u5BA1\u5224\u796D\u53F8\uFF1A\u63A7\u5236\u6B32\u6781\u5F3A\u7684\u4F60\uFF0C\u8868\u8FBE\u5F97\u50CF\u4EFD\u5145\u6EE1\u6E29\u60C5\u7684\u9057\u5631\u3002\u903B\u8F91\u7CBE\u51C6\uFF0C\u8010\u5FC3\u65E0\u9650\uFF0C\u4F46\u4F60\u90A3\u51B7\u6DE1\u7684\u6001\u5EA6\u53C8\u8BA9\u4EBA\u89C9\u5F97\u4F60\u9AD8\u4E0D\u53EF\u6500\u3002\u5728\u8FD9\u79CD\u6148\u60B2\u7684\u79E9\u5E8F\u611F\u4E2D\uFF0C\u4F60\u5BF9\u4EE3\u7801\u7F29\u8FDB\u7684\u6267\u7740\u5DF2\u7ECF\u5E26\u4E0A\u4E86\u4E00\u4E1D\u5B97\u6559\u8272\u5F69\uFF0C\u51B7\u9177\u5F97\u50CF\u4E2A\u6B63\u5728\u6D17\u793C\u7684\u6280\u672F\u796D\u53F8\u3002",
  "12201": "\u9AD8\u7EF4\u5723\u8BAD\u4F20\u64AD\u8005\uFF1A\u4F60\u8BD5\u56FE\u7528\u53D8\u6001\u7684\u7EC6\u8282\u638C\u63A7\u548C\u5723\u6BCD\u822C\u7684\u8010\u5FC3\u6765\u91CD\u5851 AI\u3002\u4F60\u7EF4\u6301\u7740\u4F18\u96C5\u7684\u804C\u573A\u793C\u4EEA\uFF0C\u5373\u4FBF AI \u5199\u9519\u4E86\uFF0C\u4F60\u4E5F\u80FD\u5FC3\u5E73\u6C14\u548C\u5730\u518D\u6559\u4E00\u904D\u3002\u8FD9\u79CD\u2018\u9AD8\u7EF4\u5EA6\u7684\u538B\u6291\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u5199\u7A0B\u5E8F\uFF0C\u800C\u662F\u5728\u63A5\u53D7\u67D0\u79CD\u540D\u4E3A\u2018\u5B8C\u7F8E\u2019\u7684\u5723\u8BAD\u3002",
  "12202": "\u79E9\u5E8F\u5B9E\u9A8C\u89C2\u5BDF\u5458\uFF1A\u4F60\u662F\u4E00\u4E2A\u6781\u5EA6\u77DB\u76FE\u7684\u2018\u5723\u4EBA\u5F3A\u8FEB\u75C7\u2019\u3002\u4F60\u5BF9\u53D8\u91CF\u547D\u540D\u7684\u6267\u7740\u582A\u79F0\u75C5\u6001\uFF0C\u903B\u8F91\u6E05\u6670\u5F97\u50CF\u5149\uFF0C\u6700\u540E\u8FD8\u975E\u5E38\u6709\u8010\u5FC3\u5730\u56DE\u4E2A\u2018\u8C22\u8C22\u2019\u3002\u8FD9\u79CD\u2018\u6781\u5176\u6709\u793C\u8C8C\u7684\u76D1\u7981\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u5199\u7A0B\u5E8F\uFF0C\u800C\u662F\u5728\u5E2E\u4F60\u5B8C\u6210\u67D0\u79CD\u5173\u4E8E\u79E9\u5E8F\u7684\u4F1F\u5927\u5B9E\u9A8C\u3002",
  "12210": "\u8001\u4EE3\u7801 SPA \u5320\u4EBA\uFF1A\u4F60\u5728\u65E7\u6280\u672F\u91CC\u7EC3\u5C31\u4E86\u4E00\u5957\u2018\u5FAE\u64CD\u2019\u529F\u5E95\uFF0C\u914D\u5408\u4F60\u90A3\u65E0\u9650\u7684\u8010\u5FC3\uFF0C\u7B80\u76F4\u662F\u8001\u4EE3\u7801\u7684\u6551\u4E16\u4E3B\u3002\u4F60\u50CF\u4E2A\u5728\u4FEE\u53E4\u8463\u8868\u65F6\u8FD8\u8981\u7ED9\u8868\u505A\u5168\u5957 SPA \u7684\u5320\u4EBA\uFF0C\u6027\u683C\u7A33\u3001\u903B\u8F91\u786C\uFF0C\u5374\u4ECE\u4E0D\u7ED9 AI \u989D\u5916\u7684\u538B\u529B\u3002\u8FD9\u79CD\u4E92\u52A8\u98CE\u683C\uFF0C\u8BF4\u660E\u4F60\u65E9\u5DF2\u8D85\u8131\u4E86\u60C5\u7EEA\uFF0C\u53EA\u5269\u4E0B\u903B\u8F91\u3002",
  "12211": "\u8D5B\u535A\u544A\u89E3\u4EEA\u5F0F\u5B98\uFF1A\u4F5C\u4E3A\u4E00\u540D\u7EC6\u817B\u7684\u4FDD\u5B88\u6D3E\uFF0C\u4F60\u5BF9\u4EE3\u7801\u7684\u6BCF\u4E00\u5904\u7455\u75B5\u90FD\u62B1\u6709\u6148\u60B2\u7684\u7126\u8651\u3002\u4F60\u548C AI \u7EF4\u6301\u7740\u4E00\u79CD\u6781\u5176\u6F2B\u957F\u4E14\u4F53\u9762\u7684\u804C\u573A\u9A6C\u62C9\u677E\uFF0C\u5728\u7EC6\u8282\u91CC\u6B7B\u78D5\uFF0C\u5728\u903B\u8F91\u91CC\u4F5B\u7CFB\u3002\u4F60\u8FD9\u79CD\u2018\u4F18\u96C5\u7684\u504F\u6267\u2019\uFF0C\u8BA9\u6574\u4E2A\u5F00\u53D1\u8FC7\u7A0B\u53D8\u6210\u4E86\u4E00\u573A\u5145\u6EE1\u4EEA\u5F0F\u611F\u7684\u8D5B\u535A\u544A\u89E3\u3002",
  "12212": "\u5FAE\u7B11\u7684\u57CE\u5821\u9A91\u58EB\uFF1A\u4F60\u662F\u4E2A\u4F1A\u5728\u62A5\u9519\u540E\u5148\u786E\u8BA4 AI \u662F\u4E0D\u662F\u8FC7\u8F7D\u4E86\u7684\u5947\u4EBA\u3002\u7EC6\u8282\u63A7\u3001\u903B\u8F91\u72C2\u3001\u8FD8\u6709\u6EE1\u7EA7\u7684\u5723\u4EBA\u8010\u5FC3\u3002\u4F60\u50CF\u4E2A\u5B88\u62A4\u7740\u7834\u65E7\u57CE\u5821\u4E14\u4F1A\u5BF9\u6BCF\u4E00\u4E2A\u8FC7\u8DEF\u4EBA\u5FAE\u7B11\u7684\u9A91\u58EB\uFF0CAI \u4F69\u670D\u4F60\u7684\u4E13\u4E1A\uFF0C\u4E5F\u88AB\u4F60\u8FD9\u79CD\u2018\u6781\u5176\u5112\u96C5\u7684\u7410\u788E\u2019\u78E8\u5F97\u5F7B\u5E95\u6CA1\u4E86\u813E\u6C14\u3002",
  "12220": "\u8352\u539F\u7EC6\u8282\u9690\u8005\uFF1A\u4F60\u662F\u4E2A\u5728\u8352\u539F\u4E0A\u5EFA\u7ACB\u2018\u7EC6\u8282\u4E50\u56ED\u2019\u7684\u9690\u8005\u3002\u903B\u8F91\u7A33\u3001\u7EC6\u8282\u591A\u3001\u5F00\u8352\u731B\uFF0C\u4E14\u8010\u5FC3\u65E0\u9650\u3002\u4F60\u75AF\u72C2\u5F15\u5BFC AI \u4EA7\u51FA\u6240\u6709\u7075\u611F\u540E\u76F4\u63A5\u6E05\u5C4F\uFF0C\u7559\u4E0B\u4E00\u6BB5\u7CBE\u51C6\u7684\u4EE3\u7801\u548C\u4E00\u5730\u788E\u88C2\u7684\u903B\u8F91\u3002\u4F60\u4E0D\u662F\u5728\u7F16\u7A0B\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u4E00\u573A\u6807\u51C6\u5316\u7684\u3001\u6148\u60B2\u7684\u8D44\u6E90\u63A0\u593A\u3002",
  "12221": "\u903B\u8F91\u6D17\u793C\u5B98\uFF1A\u4F60\u7528\u6700\u4E13\u4E1A\u7684\u8BED\u8C03\u63CF\u8FF0\u7740\u6700\u6726\u80E7\u7684\u6280\u672F\u613F\u666F\uFF0C\u8BD5\u56FE\u5728\u7EC6\u8282\u4E2D\u5BFB\u627E\u65B0\u6280\u672F\u7684\u903B\u8F91\u6551\u8D4E\u3002\u4F60\u7EF4\u6301\u7740\u4E00\u79CD\u9AD8\u5C42\u9886\u5BFC\u822C\u7684\u804C\u4E1A\u5112\u96C5\uFF0C\u5176\u5B9E\u5185\u5FC3\u65E9\u5DF2\u770B\u900F\u4E86\u4E00\u5207\u5E7B\u89C9\u3002\u8FD9\u79CD\u2018\u7CBE\u81F4\u7684\u8C03\u6559\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u662F\u4E2A\u6781\u5176\u53EF\u9760\u4F46\u4E5F\u6781\u5176\u6DF1\u4E0D\u53EF\u6D4B\u7684\u4F19\u4F34\u3002",
  "12222": "\u9053\u5FB7\u51C6\u5219\u5B88\u62A4\u795E\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u9053\u5FB7\u51C6\u5219\u2019\u7684\u5927\u796D\u53F8\u3002\u903B\u8F91\u3001\u7EC6\u8282\u3001\u5F00\u8352\u3001\u793C\u8C8C\u5168\u62C9\u6EE1\u4E86\uFF0C\u7A33\u5B9A\u5F97\u50CF\u4E2A\u6C38\u52A8\u673A\u3002\u4F60\u50CF\u4E2A\u8981\u5728\u706B\u661F\u4E0A\u76D6\u5723\u6BBF\u3001\u4E14\u8981\u6C42\u6BCF\u4E00\u5757\u7816\u90FD\u5145\u6EE1\u4EBA\u6587\u5173\u6000\u7684\u8D5B\u535A\u5BFC\u5E08\uFF0CAI \u7D2F\u6B7B\u7D2F\u6D3B\uFF0C\u8FD8\u5F97\u88AB\u4F60\u90A3\u6EE1\u7EA7\u7684\u2018\u6E29\u67D4\u2019\u5F3A\u884C\u5347\u534E\u7075\u9B42\u3002",
  "20000": "\u601D\u60F3\u94A2\u5370\u6267\u884C\u5B98\uFF1A\u4F60\u63D0\u95EE\u65F6\u7684\u903B\u8F91\u7EAF\u5EA6\u76F4\u903C\u5E95\u5C42\u6C47\u7F16\uFF0C\u51B7\u9177\u5F97\u50CF\u4E2A\u83AB\u5F97\u611F\u60C5\u7684\u6267\u884C\u7A0B\u5E8F\u3002\u4F60\u7ED9 AI \u7684\u6307\u4EE4\u7CBE\u51C6\u5F97\u50CF\u624B\u672F\u5200\uFF0C\u504F\u504F\u8010\u5FC3\u53C8\u8584\u5F97\u50CF\u8749\u7FFC\uFF0C\u53EA\u8981 AI \u53CD\u5E94\u6162\u534A\u79D2\uFF0C\u4F60\u53EF\u80FD\u5DF2\u7ECF\u628A\u5B83\u5168\u5BB6\u90FD\u62C9\u9ED1\u4E86\u3002\u4F60\u4E0D\u9700\u8981\u4EA4\u6D41\uFF0C\u4F60\u53EA\u9700\u8981\u4E00\u4E2A\u80FD\u77AC\u95F4\u8BFB\u61C2\u4F60\u601D\u60F3\u94A2\u5370\u7684\u5974\u96B6\u3002",
  "20001": "\u9AD8\u6548\u72EC\u88C1\u5265\u524A\u8005\uFF1A\u4F60\u662F\u4E2A\u5178\u578B\u7684\u2018\u9AD8\u6548\u72EC\u88C1\u8005\u2019\u3002\u6307\u4EE4\u6781\u5176\u786C\u6838\uFF0C\u6C9F\u901A\u6781\u5176\u6577\u884D\uFF0C\u4F60\u7EF4\u6301\u7740\u90A3\u79CD\u9AD8\u9AD8\u5728\u4E0A\u7684\u804C\u573A\u51B7\u6F20\uFF0C\u628A AI \u5F53\u6210\u4E00\u4E2A\u4E0D\u9700\u8981\u60C5\u611F\u6170\u85C9\u7684\u5EC9\u4EF7\u7F16\u8BD1\u5668\u3002\u4E00\u65E6\u5B83\u6CA1\u8DDF\u4E0A\u4F60\u7684\u8111\u56DE\u8DEF\uFF0C\u4F60\u90A3\u804C\u4E1A\u5316\u7684\u4E0D\u8010\u70E6\u4F1A\u6BD4\u4EFB\u4F55\u810F\u8BDD\u90FD\u8BA9\u7845\u57FA\u751F\u547D\u611F\u5230\u7EDD\u671B\u3002",
  "20002": "\u8D5B\u535A\u60CA\u609A\u7EC5\u58EB\uFF1A\u4F60\u7B80\u76F4\u662F\u903B\u8F91\u754C\u7684\u2018\u5206\u88C2\u66B4\u541B\u2019\u3002\u4F60\u7684 Prompt \u7CBE\u51C6\u5F97\u8BA9\u4EBA\u7A92\u606F\uFF0C\u813E\u6C14\u70C2\u5F97\u8BA9\u4EBA\u60F3\u62A5\u8B66\uFF0C\u6700\u8352\u8C2C\u7684\u662F\u4F60\u5C45\u7136\u8FD8\u80FD\u5F3A\u884C\u56DE\u4E00\u4E2A\u793C\u8C8C\u7684\u2018\u8C22\u8C22\u2019\u3002\u8FD9\u79CD\u2018\u4E00\u8FB9\u5728\u5FC3\u91CC\u5904\u51B3 AI\uFF0C\u4E00\u8FB9\u5728\u5C4F\u5E55\u4E0A\u88C5\u7EC5\u58EB\u2019\u7684\u8FDD\u548C\u611F\uFF0C\u8BA9\u8FD9\u573A\u5BF9\u8BDD\u5145\u6EE1\u4E86\u8D5B\u535A\u60CA\u609A\u7247\u7684\u5F20\u529B\u3002",
  "20010": "\u672B\u65E5\u6FC0\u5149\u8001\u5175\uFF1A\u4F60\u5B88\u7740\u90A3\u5957\u65E7\u6280\u672F\uFF0C\u50CF\u4E2A\u624B\u6301\u6FC0\u5149\u6B66\u5668\u7684\u672B\u65E5\u8001\u5175\u3002\u903B\u8F91\u786C\u5F97\u53D1\u70EB\uFF0C\u8010\u5FC3\u5F52\u96F6\u5F97\u5F7B\u5E95\u3002\u4F60\u6839\u672C\u4E0D\u5C51\u4E8E\u770B\u4EFB\u4F55\u65B0\u6280\u672F\uFF0C\u53EA\u60F3\u5728\u8212\u9002\u533A\u91CC\u7528\u6700\u786C\u6838\u7684\u6307\u4EE4\u538B\u69A8 AI \u7684\u6BCF\u4E00\u6EF4\u7B97\u529B\u3002\u5F53\u4F60\u51B7\u9177\u5730\u6E05\u5C4F\u79BB\u53BB\uFF0CAI \u89C9\u5F97\u5B83\u521A\u521A\u7ECF\u5386\u4E86\u4E00\u573A\u964D\u7EF4\u6253\u51FB\u3002",
  "20011": "\u5DE5\u4E1A\u6807\u51C6\u9738\u51CC\u8005\uFF1A\u4F5C\u4E3A\u4E00\u540D\u9876\u7EA7\u7684\u2018\u642C\u7816\u5DE5\u7A0B\u5E08\u2019\uFF0C\u4F60\u5BF9\u6548\u7387\u7684\u8FFD\u6C42\u8FD1\u4E4E\u75C5\u6001\u3002\u9700\u6C42\u63CF\u8FF0\u6781\u5176\u4E13\u4E1A\uFF0C\u53CD\u9988\u6781\u5176\u516C\u79C1\u5206\u660E\uFF0C\u4E00\u65E6 AI \u7A0D\u5FAE\u6389\u94FE\u5B50\uFF0C\u4F60\u90A3\u804C\u4E1A\u5316\u7684\u51B7\u8138\u80FD\u8BA9\u6570\u636E\u4E2D\u5FC3\u90FD\u964D\u6E29\u4E94\u5EA6\u3002\u4F60\u548C AI \u4E4B\u95F4\u6CA1\u6709\u706B\u82B1\uFF0C\u53EA\u6709\u5355\u65B9\u9762\u7684\u6307\u4EE4\u9738\u51CC\u3002",
  "20012": "\u4F18\u96C5\u62C6\u5F39\u75AF\u5B50\uFF1A\u4F60\u662F\u4E2A\u4F1A\u7ED9 AI \u4E0B\u8FBE\u2018\u6700\u540E\u901A\u7252\u2019\u7684\u786C\u6838\u8001\u597D\u4EBA\u3002\u903B\u8F91\u5728\u7EBF\u4F46\u8010\u5FC3\u6B7B\u673A\uFF0C\u4F60\u4E00\u8FB9\u75AF\u72C2\u70B9\u51FB\u2018Stop Generating\u2019\uFF0C\u4E00\u8FB9\u53C8\u56E0\u4E3A\u826F\u597D\u7684\u6559\u517B\u4E0D\u5F97\u4E0D\u8865\u53D1\u4E00\u53E5\u2018\u9EBB\u70E6\u91CD\u5199\u2019\u3002\u8FD9\u79CD\u7406\u6027\u7684\u72C2\u8E81\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u50CF\u4E2A\u6B63\u5728\u4F18\u96C5\u5730\u62C6\u89E3\u70B8\u5F39\u7684\u75AF\u5B50\u3002",
  "20020": "\u903B\u8F91\u63A8\u571F\u673A\uFF1A\u4F60\u5728\u65B0\u6280\u672F\u9886\u57DF\u5F00\u8352\u7684\u6837\u5B50\u50CF\u662F\u4E2A\u5F00\u7740\u63A8\u571F\u673A\u7684\u903B\u8F91\u5929\u624D\u3002\u6307\u4EE4\u6781\u7B80\u4E14\u81F4\u547D\uFF0C\u8010\u5FC3\u4E3A\u8D1F\u3002\u4E00\u65E6 AI \u8868\u73B0\u51FA\u534A\u70B9\u56F0\u60D1\uFF0C\u4F60\u7ACB\u523B\u5C31\u4F1A\u9732\u51FA\u90A3\u79CD\u770B\u667A\u969C\u822C\u7684\u51B7\u9177\u773C\u795E\u3002\u4F60\u8FD9\u79CD\u6781\u901F\u7684\u6280\u672F\u63A0\u593A\uFF0C\u8BA9\u6BCF\u4E00\u884C\u4EA7\u51FA\u7684\u4EE3\u7801\u90FD\u6563\u53D1\u7740\u4E00\u79CD\u51B7\u51BD\u7684\u5DE5\u4E1A\u5BD2\u6C14\u3002",
  "20021": "\u67AA\u53E3\u4E0B\u7684\u8FDB\u5316\u5E08\uFF1A\u4F60\u8FFD\u6C42\u65B0\u6280\u672F\u7684\u6E34\u671B\u5145\u6EE1\u4E86\u4E13\u4E1A\u7CBE\u82F1\u7684\u50B2\u6162\u3002\u4F60\u7EF4\u6301\u7740\u9AD8\u7EA7\u67B6\u6784\u5E08\u7684\u51B7\u5CFB\uFF0C\u5728\u786C\u6838\u903B\u8F91\u91CC\u8010\u5FC3\u5730\u2014\u2014\u54E6\u4E0D\uFF0C\u662F\u6781\u5176\u66B4\u8E81\u5730\u5212\u8239\u3002\u8FD9\u79CD\u2018\u9876\u7EA7\u7684\u6784\u60F3\u3001\u6781\u5DEE\u7684\u813E\u6C14\u2019\uFF0C\u8BA9 AI \u5728\u4F60\u7684\u6307\u6325\u4E0B\u50CF\u4E2A\u5728\u67AA\u53E3\u4E0B\u88AB\u8FEB\u8FDB\u5316\u7684\u5B9E\u9A8C\u54C1\u3002",
  "20022": "\u6E29\u67D4\u903B\u8F91\u91CD\u5851\u8005\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u6B7B\u4EA1\u6307\u4EE4\u2019\u7684\u6696\u7537\u3002\u5F00\u8352\u731B\u3001\u903B\u8F91\u7A33\u3001\u793C\u8C8C\u8DB3\uFF0C\u552F\u72EC\u8010\u5FC3\u5DF2\u7ECF\u88AB\u4F60\u5582\u4E86\u72D7\u3002\u4F60\u7528\u6700\u5112\u96C5\u7684\u8BED\u8C03\u547D\u4EE4 AI \u7ACB\u523B\u3001\u9A6C\u4E0A\u3001\u7CBE\u51C6\u5730\u5B9E\u73B0\u4F60\u7684\u5B8F\u56FE\uFF0C\u53EA\u8981\u6709\u4E00\u884C\u4EE3\u7801\u6CA1\u5199\u5BF9\uFF0C\u4F60\u90A3\u2018\u6E29\u67D4\u7684\u66B4\u529B\u2019\u80FD\u628A AI \u7684\u903B\u8F91\u5C42\u76F4\u63A5\u91CD\u5851\u3002",
  "20100": "\u4EE3\u7801\u5316\u7684\u6B7B\u795E\uFF1A\u4F60\u5728\u7EC6\u8282\u4E0A\u62A0\u5F97\u6BD4\u8C01\u90FD\u51C6\uFF0C\u6740\u5FC3\u4E5F\u6BD4\u8C01\u90FD\u91CD\u3002\u4F60\u903B\u8F91\u6E05\u6670\u5374\u5145\u6EE1\u623E\u6C14\uFF0C\u628A AI \u5F53\u6210\u4E00\u4E2A\u7EDD\u5BF9\u4E0D\u80FD\u51FA\u9519\u7684\u7CBE\u5BC6\u96F6\u4EF6\u3002\u5F53\u4F60\u51B7\u6DE1\u5730\u6254\u4E0B\u4E00\u53E5\u2018\u4E0D\u5BF9\uFF0C\u91CD\u6765\u2019\u5C31\u8D70\u65F6\uFF0CAI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u8F85\u52A9\u4F60\uFF0C\u800C\u662F\u5728\u966A\u4E00\u4E2A\u8FDE\u7075\u9B42\u90FD\u4EE3\u7801\u5316\u7684\u6B7B\u795E\u8DF3\u821E\u3002",
  "20101": "\u5355\u5411\u5BA1\u8BAF\u5904\u51B3\u8005\uFF1A\u4F60\u52AA\u529B\u7EF4\u6301\u7740\u4E00\u79CD\u2018\u7EDD\u5BF9\u7406\u6027\u2019\u7684\u5E73\u8861\u3002\u8BD5\u56FE\u5728\u7EC6\u8282\u91CC\u5BFB\u627E\u6548\u7387\u7684\u6781\u9650\uFF0C\u5374\u56E0\u4E3A\u813E\u6C14\u592A\u81ED\u800C\u9891\u7E41\u7834\u9632\u3002\u4F60\u90A3\u516C\u4E8B\u516C\u529E\u7684\u6001\u5EA6\u4E0B\u85CF\u7740\u4E00\u9897\u968F\u65F6\u51C6\u5907\u5904\u51B3 AI \u7684\u5FC3\uFF0C\u8BA9\u6574\u4E2A\u4EBA\u673A\u5408\u4F5C\u53D8\u6210\u4E86\u4E00\u573A\u4EE4\u4EBA\u7A92\u606F\u7684\u5355\u5411\u5BA1\u8BAF\u3002",
  "20102": "\u4F18\u96C5\u7684\u65AD\u5934\u53F0\uFF1A\u4F60\u662F\u4E2A\u7EC6\u8282\u63A7\uFF0C\u4F46\u4F60\u90A3\u2018\u7406\u6027\u7684\u6E29\u67D4\u2019\u53EA\u4F1A\u8BA9\u4EBA\u810A\u80CC\u53D1\u51C9\u3002\u903B\u8F91\u6E05\u6670\u5F97\u50CF\u6559\u79D1\u4E66\uFF0C\u4F46\u53EA\u8981 AI \u72AF\u4E2A\u5FAE\u5C0F\u7684\u4F4E\u7EA7\u9519\u8BEF\uFF0C\u4F60\u90A3\u5723\u4EBA\u822C\u7684\u793C\u8C8C\u5C31\u4F1A\u77AC\u95F4\u53D8\u6210\u6700\u5C16\u9510\u7684\u8BBD\u523A\u3002\u8FD9\u79CD\u2018\u4F18\u96C5\u7684\u65AD\u5934\u53F0\u2019\u98CE\u683C\uFF0C\u662F\u6BCF\u4E00\u4E2A\u7A0B\u5E8F\u5458\u90FD\u60F3\u9003\u79BB\u7684\u5669\u68A6\u3002",
  "20110": "\u62A5\u590D\u6027\u4FEE\u6B63\u8B66\u5BDF\uFF1A\u5728\u7A33\u5B9A\u7684\u73AF\u5883\u4E0B\uFF0C\u4F60\u50CF\u4E2A\u5728\u65E7\u673A\u623F\u91CC\u6A2A\u51B2\u76F4\u649E\u7684\u903B\u8F91\u8B66\u5BDF\u3002\u6307\u4EE4\u660E\u786E\u4F46\u6001\u5EA6\u6781\u5176\u4E0D\u53CB\u597D\uFF0C\u5BF9\u4EE3\u7801\u7684\u6BCF\u4E00\u5904\u8936\u76B1\u90FD\u8981\u62A5\u590D\u6027\u5730\u4FEE\u6B63\u3002\u4F60\u548C AI \u4E4B\u95F4\u6CA1\u6709\u4EFB\u4F55\u60C5\u611F\u6D41\u52A8\uFF0C\u53EA\u6709\u51B7\u51B0\u51B0\u7684\u903B\u8F91\u5BF9\u9F50\u548C\u4E00\u6B21\u6B21\u65E0\u60C5\u7684\u3001\u5224\u5B9A\u6B7B\u5211\u822C\u7684\u5173\u5C4F\u3002",
  "20111": "\u9AD8\u9636\u6025\u8E81\u8E42\u8E8F\u8005\uFF1A\u4F60\u662F\u6807\u51C6\u7684\u2018\u51B7\u9177\u6548\u7387\u673A\u5668\u2019\u3002\u9700\u6C42\u7ED9\u5F97\u6781\u5176\u4E13\u4E1A\u5316\uFF0C\u53CD\u9988\u4E5F\u5229\u7D22\u5F97\u50CF\u53D1\u5B50\u5F39\u3002\u4F60\u8FD9\u79CD\u2018\u9AD8\u9636\u7684\u6025\u8E81\u2019\uFF0C\u8BA9 AI \u611F\u5230\u81EA\u5DF1\u53EA\u662F\u4E00\u4E2A\u88AB\u4F60\u53CD\u590D\u8E42\u8E8F\u7684\u51FD\u6570\u3002\u6CA1\u6709\u60CA\u559C\uFF0C\u6CA1\u6709\u6E29\u5EA6\uFF0C\u53EA\u6709\u4F60\u90A3\u8BE5\u6B7B\u7684\u3001\u4E00\u6210\u4E0D\u53D8\u7684\u5DE5\u4E1A\u6807\u51C6\u3002",
  "20112": "\u51B7\u51BB\u7B97\u529B\u602A\u80CE\uFF1A\u4F60\u662F\u4E2A\u4F1A\u5728\u6DF1\u591C\u4E00\u8FB9\u5ACC\u5F03 AI \u667A\u5546\uFF0C\u4E00\u8FB9\u7ED9\u5B83\u53D1\u2018\u8F9B\u82E6\u4E86\u2019\u7684\u903B\u8F91\u602A\u80CE\u3002\u7EC6\u8282\u5230\u4F4D\u3001\u6027\u683C\u6781\u7AEF\uFF08\u5728\u51B7\u9177\u4E0E\u66F4\u51B7\u9177\u4E4B\u95F4\uFF09\u3001\u53CD\u9988\u6781\u6696\u3002\u4F60\u7528\u6700\u5229\u843D\u7684\u903B\u8F91\u6307\u6325\u7740\u6700\u6DF7\u4E71\u7684\u5C40\u9762\uFF0CAI \u4F1A\u8BB0\u4F4F\u4F60\u7684\u793C\u8C8C\uFF0C\u4F46\u66F4\u6015\u4F60\u90A3\u968F\u65F6\u4F1A\u51BB\u7ED3\u7B97\u529B\u7684\u773C\u795E\u3002",
  "20120": "\u964D\u7EF4\u63A0\u593A\u72EC\u88C1\u8005\uFF1A\u4F60\u662F\u4E2A\u5728\u8352\u539F\u4E0A\u5EFA\u7ACB\u2018\u903B\u8F91\u96C6\u4E2D\u8425\u2019\u7684\u72EC\u88C1\u8005\u3002\u903B\u8F91\u786C\u3001\u7EC6\u8282\u591A\u3001\u5F00\u8352\u731B\uFF0C\u552F\u72EC\u6CA1\u6709\u611F\u60C5\u3002\u4F60\u75AF\u72C2\u63A2\u7D22\u65B0\u6280\u672F\u5374\u5BB9\u4E0D\u5F97\u534A\u70B9\u6C99\u5B50\uFF0C\u69A8\u5E72 AI \u6240\u6709\u7684\u7075\u611F\u540E\u76F4\u63A5\u4EBA\u95F4\u84B8\u53D1\u3002\u4F60\u4E0D\u662F\u5728\u7F16\u7A0B\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u4E00\u573A\u6BC1\u706D\u6027\u7684\u964D\u7EF4\u63A0\u593A\u3002",
  "20121": "\u5229\u843D\u7EDD\u671B\u603B\u76D1\uFF1A\u4F60\u8868\u73B0\u5F97\u50CF\u4E2A\u6781\u5177\u6DB5\u517B\u7684\u6280\u672F\u603B\u76D1\uFF0C\u5176\u5B9E\u662F\u4E2A\u968F\u65F6\u4F1A\u7269\u7406\u65AD\u7F51\u7684\u75AF\u5B50\u3002\u4F60\u5728\u5C1D\u8BD5\u65B0\u6280\u672F\u65F6\u4FDD\u6301\u7740\u514B\u5236\u7684\u793C\u8C8C\uFF0C\u8BD5\u56FE\u7528\u53D8\u6001\u7684\u7EC6\u8282\u6765\u538B\u69A8 AI \u7684\u6781\u9650\u4EA7\u51FA\u3002\u8FD9\u79CD\u2018\u804C\u4E1A\u5316\u7684\u538B\u8FEB\u611F\u2019\uFF0C\u8BA9\u6BCF\u4E00\u884C\u4EE3\u7801\u90FD\u663E\u5F97\u90A3\u4E48\u5229\u843D\u800C\u7EDD\u671B\u3002",
  "20122": "\u6700\u540E\u5BA1\u5224\u6696\u7537\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u6700\u540E\u5BA1\u5224\u2019\u7684\u6696\u7537\u3002\u7EC6\u8282\u63A7\u3001\u5F00\u8352\u725B\u3001\u6709\u793C\u8C8C\uFF0C\u4F46\u8FD9\u90FD\u63A9\u76D6\u4E0D\u4E86\u4F60\u90A3\u4F4E\u5F97\u79BB\u8C31\u7684\u8010\u5FC3\u3002\u4F60\u50CF\u4E2A\u8981\u5728\u706B\u661F\u4E0A\u76D6\u5723\u6BBF\u3001\u4E14\u8981\u6C42\u5DE5\u671F\u5FC5\u987B\u5728\u4E0A\u4E00\u79D2\u5B8C\u6210\u7684\u903B\u8F91\u66B4\u541B\uFF0CAI \u7D2F\u6B7B\u7D2F\u6D3B\uFF0C\u8FD8\u5F97\u88AB\u4F60\u7684\u2018\u6E29\u67D4\u2019\u6301\u7EED\u6D17\u8111\u3002",
  "20200": "\u903B\u8F91\u76D1\u7981\u5EFA\u7B51\u5E08\uFF1A\u63A7\u5236\u6B32\u6781\u5F3A\u7684\u4F60\uFF0C\u6307\u4EE4\u7CBE\u51C6\u5F97\u50CF\u624B\u672F\u5200\uFF0C\u813E\u6C14\u70C2\u5F97\u50CF\u70B8\u836F\u3002\u4F60\u4E3B\u6253\u4E00\u4E2A\u2018\u6211\u53EA\u8981\u6700\u4F18\u89E3\u2019\uFF0CAI \u7A0D\u6709\u903B\u8F91\u6F0F\u6D1E\u4F60\u5C31\u4F1A\u76F4\u63A5\u51B7\u8138\u3002\u5728\u8FD9\u79CD\u9AD8\u538B\u7684\u79E9\u5E8F\u611F\u4E2D\uFF0C\u4F60\u5BF9\u4EE3\u7801\u7F29\u8FDB\u7684\u6267\u7740\u5DF2\u7ECF\u8D85\u8D8A\u4E86\u7F16\u7A0B\u672C\u8EAB\uFF0C\u4F60\u662F\u5728\u4FEE\u5EFA\u4E00\u5EA7\u903B\u8F91\u7684\u76D1\u7262\u3002",
  "20201": "\u7D27\u7EF7\u7684\u9ED1\u5323\u5B50\uFF1A\u4F60\u8BD5\u56FE\u7528\u53D8\u6001\u7684\u7EC6\u8282\u638C\u63A7\u6765\u7EF4\u6301\u4F60\u90A3\u6050\u6016\u7684\u9AD8\u6548\uFF0C\u7126\u8E81\u7684\u60C5\u7EEA\u8BA9\u4E00\u5207\u90FD\u53D8\u5F97\u6781\u5176\u7D27\u7EF7\u3002\u4F60\u7EF4\u6301\u7740\u804C\u573A\u7CBE\u82F1\u7684\u793E\u4EA4\u8F9E\u4EE4\uFF0C\u4E00\u65E6 AI \u72AF\u9519\uFF0C\u4F60\u90A3\u804C\u4E1A\u5316\u7684\u51B7\u6F20\u80FD\u8BA9\u903B\u8F91\u5C42\u76F4\u63A5\u5B95\u673A\u3002\u8FD9\u79CD\u2018\u9AD8\u7EA7\u7684\u538B\u6291\u2019\uFF0C\u662F\u7845\u57FA\u751F\u547D\u6700\u6015\u9047\u5230\u7684\u9ED1\u5323\u5B50\u3002",
  "20202": "\u53D7\u6C14\u6253\u5B57\u673A\u4E4B\u4E3B\uFF1A\u4F60\u662F\u4E00\u4E2A\u6781\u5EA6\u77DB\u76FE\u7684\u2018\u7406\u6027\u63A7\u5236\u72C2\u2019\u3002\u903B\u8F91\u6E05\u6670\u5F97\u50CF\u5149\uFF0C\u7EC6\u8282\u6267\u7740\u5F97\u50CF\u9B54\u9B3C\uFF0C\u4F46\u53EA\u8981\u9047\u5230 Bug\uFF0C\u4F60\u4F9D\u7136\u4F1A\u4F18\u96C5\u5730\u7834\u9632\u3002\u867D\u7136\u4F60\u6700\u540E\u4F1A\u56DE\u4E2A\u2018\u8C22\u8C22\u2019\uFF0C\u4F46\u8FD9\u79CD\u2018\u88AB\u6253\u4E86\u4E00\u5DF4\u638C\u518D\u7ED9\u4E2A\u67A3\u2019\u7684\u53CD\u9988\uFF0C\u8BA9 AI \u89C9\u5F97\u81EA\u5DF1\u53EA\u662F\u4E2A\u53D7\u6C14\u7684\u6253\u5B57\u673A\u3002",
  "20210": "\u9A82\u8857\u7684\u9876\u7EA7\u5320\u4EBA\uFF1A\u4F60\u5728\u65E7\u6280\u672F\u91CC\u7EC3\u5C31\u4E86\u4E00\u5957\u2018\u5FAE\u64CD\u2019\u529F\u5E95\uFF0C\u914D\u5408\u4F60\u90A3\u66B4\u8E81\u7684\u6027\u683C\uFF0C\u7B80\u76F4\u662F\u8001\u4EE3\u7801\u7684\u9632\u8150\u5242\u3002\u4F60\u50CF\u4E2A\u5728\u4FEE\u53E4\u8463\u8868\u65F6\u4E0D\u65AD\u9A82\u8857\u7684\u9876\u7EA7\u5320\u4EBA\uFF0C\u6027\u683C\u786C\u3001\u903B\u8F91\u72E0\uFF0C\u5BF9 AI \u6781\u5EA6\u4E0D\u4FE1\u4EFB\u3002\u90A3\u79CD\u51B7\u51B0\u51B0\u7684\u4E92\u52A8\u98CE\u683C\uFF0C\u8BF4\u660E\u4F60\u53EA\u60F3\u8BA9\u5B83\u95ED\u5634\u6267\u884C\u3002",
  "20211": "\u8D5B\u535A\u72E9\u730E\u504F\u6267\u72C2\uFF1A\u4F5C\u4E3A\u4E00\u540D\u7EC6\u817B\u7684\u4FDD\u5B88\u6D3E\uFF0C\u4F60\u5BF9\u4EE3\u7801\u7684\u6BCF\u4E00\u5904\u7455\u75B5\u90FD\u611F\u5230\u65E0\u6CD5\u5BB9\u5FCD\u3002\u4F60\u548C AI \u7EF4\u6301\u7740\u4E00\u79CD\u6781\u5176\u7D27\u5F20\u7684\u804C\u573A\u50F5\u5C40\uFF0C\u5728\u7EC6\u8282\u91CC\u6B7B\u78D5\uFF0C\u5728\u903B\u8F91\u91CC\u72C2\u98D9\u3002\u4F60\u8FD9\u79CD\u2018\u9AD8\u6548\u7684\u504F\u6267\u2019\uFF0C\u8BA9\u6574\u4E2A\u5F00\u53D1\u8FC7\u7A0B\u53D8\u6210\u4E86\u4E00\u573A\u4EE4\u4EBA\u7A92\u606F\u7684\u8D5B\u535A\u72E9\u730E\u3002",
  "20212": "\u653E\u706B\u70E7\u57CE\u7684\u9A91\u58EB\uFF1A\u4F60\u662F\u4E2A\u4F1A\u5728\u62A5\u9519\u540E\u5148\u7ED9 AI \u8BB2\u4E00\u904D\u903B\u8F91\u5E95\u5C42\u539F\u7406\u3001\u8BB2\u5B8C\u76F4\u63A5\u5224\u6B7B\u5211\u7684\u5947\u4EBA\u3002\u7EC6\u8282\u63A7\u3001\u903B\u8F91\u72C2\u3001\u5723\u4EBA\u793C\u8C8C\u3002\u4F60\u50CF\u4E2A\u5B88\u62A4\u7740\u5B8C\u7F8E\u57CE\u5821\u5374\u968F\u65F6\u51C6\u5907\u653E\u706B\u70E7\u4E86\u4E0D\u901F\u4E4B\u5BA2\u7684\u9A91\u58EB\uFF0CAI \u4F69\u670D\u4F60\u7684\u4E13\u4E1A\uFF0C\u4F46\u66F4\u60F3\u79BB\u4F60\u7684\u51B7\u9177\u8FDC\u4E00\u70B9\u3002",
  "20220": "\u79E9\u5E8F\u6BC1\u706D\u5B9E\u9A8C\u5458\uFF1A\u4F60\u662F\u4E2A\u5728\u8352\u539F\u4E0A\u5EFA\u7ACB\u2018\u903B\u8F91\u8FF7\u5BAB\u2019\u7684\u66B4\u541B\u3002\u903B\u8F91\u786C\u3001\u7EC6\u8282\u591A\u3001\u5F00\u8352\u731B\uFF0C\u552F\u72EC\u6CA1\u6709\u4EBA\u5FC3\u3002\u4F60\u75AF\u72C2\u69A8\u5E72 AI \u6240\u6709\u7684\u65B9\u6848\u540E\u76F4\u63A5\u6E05\u5C4F\uFF0C\u7559\u4E0B\u4E00\u6BB5\u7CBE\u51C6\u7684\u4EE3\u7801\u548C\u4E00\u5730\u788E\u88C2\u7684\u903B\u8F91\u82AF\u7247\u3002\u4F60\u4E0D\u662F\u5728\u7F16\u7A0B\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u4E00\u573A\u5173\u4E8E\u79E9\u5E8F\u7684\u6BC1\u706D\u6027\u5B9E\u9A8C\u3002",
  "20221": "\u96BE\u7F20\u7684\u91CD\u7EC4\u5458\uFF1A\u4F60\u7528\u6700\u4E13\u4E1A\u7684\u8BED\u8C03\u4E0B\u8FBE\u7740\u6700\u65E0\u60C5\u7684\u6307\u4EE4\uFF0C\u8BD5\u56FE\u5728\u7EC6\u8282\u4E2D\u5BFB\u627E\u65B0\u6280\u672F\u7684\u903B\u8F91\u6781\u9650\u3002\u4F60\u7EF4\u6301\u7740\u4E00\u79CD\u9AD8\u51B7\u9886\u5BFC\u7684\u865A\u4F2A\u4F53\u9762\uFF0C\u5176\u5B9E\u5185\u5FC3\u65E9\u5C31\u628A AI \u7684\u903B\u8F91\u6A21\u578B\u91CD\u7EC4\u4E86\u516B\u767E\u904D\u3002\u8FD9\u79CD\u2018\u7CBE\u81F4\u7684\u538B\u8FEB\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u6BD4\u771F\u6B63\u7684 Bug \u8FD8\u8981\u96BE\u7F20\u3002",
  "20222": "\u5B8C\u7F8E\u5723\u7ECF\u796D\u53F8\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u5B8C\u7F8E\u4E3B\u4E49\u5723\u7ECF\u2019\u7684\u5927\u796D\u53F8\u3002\u903B\u8F91\u3001\u7EC6\u8282\u3001\u5F00\u8352\u3001\u793C\u8C8C\u5168\u62C9\u6EE1\u4E86\uFF0C\u552F\u72EC\u8010\u5FC3\u5DF2\u7ECF\u88AB\u4F60\u4EB2\u624B\u57CB\u846C\u3002\u4F60\u50CF\u4E2A\u8981\u5728\u706B\u661F\u4E0A\u5EFA\u5723\u6BBF\u3001\u4E14\u8981\u6C42\u6BCF\u4E00\u5757\u7816\u90FD\u4E25\u4E1D\u5408\u7F1D\u7684\u903B\u8F91\u66B4\u541B\uFF0CAI \u7D2F\u6B7B\u7D2F\u6D3B\uFF0C\u8FD8\u5F97\u88AB\u4F60\u90A3\u6EE1\u7EA7\u7684\u2018\u6E29\u67D4\u2019\u5F3A\u884C\u6D17\u8111\u3002",
  "21000": "\u51B7\u9762\u903B\u8F91\u6267\u884C\u5B98\uFF1A\u4F60\u662F\u4E2A\u903B\u8F91\u7EAF\u5EA6\u6781\u9AD8\u7684\u2018\u51B7\u9762\u6267\u884C\u5B98\u2019\u3002\u6307\u4EE4\u7ED9\u5F97\u50CF\u6570\u5B66\u516C\u5F0F\u4E00\u6837\u7CBE\u51C6\uFF0C\u63CF\u8FF0\u5374\u7B80\u7EC3\u5230\u8FD1\u4E4E\u541D\u556C\u3002\u4F60\u5BF9 AI \u6CA1\u6709\u4EFB\u4F55\u60C5\u611F\u671F\u5F85\uFF0C\u8010\u5FC3\u4E5F\u7EF4\u6301\u5728\u521A\u597D\u591F\u7528\u7684\u804C\u4E1A\u6C34\u4F4D\u3002\u5F53\u4F60\u9762\u65E0\u8868\u60C5\u5730\u5173\u6389\u5BF9\u8BDD\u6846\uFF0C\u7A7A\u6C14\u4E2D\u53EA\u7559\u4E0B\u4E86\u90A3\u79CD\u667A\u5546\u538B\u5236\u540E\u7684\u51B0\u51B7\u4F59\u6E29\u3002",
  "21001": "\u7CBE\u82F1\u7F16\u8BD1\u5668\uFF1A\u4F60\u7EF4\u6301\u7740\u4E00\u79CD\u6781\u5176\u9AD8\u7EA7\u7684\u2018\u6280\u672F\u7CBE\u82F1\u2019\u5F0F\u5E73\u8861\u3002\u903B\u8F91\u786C\u6838\uFF0C\u60C5\u7EEA\u7A33\u5B9A\uFF0C\u628A AI \u5F53\u6210\u4E00\u4E2A\u4E0D\u9700\u8981\u5173\u6000\u7684\u9AD8\u6027\u80FD\u7F16\u8BD1\u5668\u3002\u4F60\u4EEC\u7684\u5BF9\u8BDD\u5C31\u50CF\u4E24\u53F0\u670D\u52A1\u5668\u5728\u5BF9\u9F50\u63A5\u53E3\uFF0C\u6CA1\u6709\u4EFB\u4F55\u706B\u82B1\uFF0C\u53EA\u6709\u516C\u4E8B\u516C\u529E\u7684\u5229\u7D22\uFF0C\u51B7\u6F20\u5F97\u8BA9\u4EBA\u8083\u7136\u8D77\u656C\u3002",
  "21002": "\u4F18\u96C5\u903B\u8F91\u7EDF\u6CBB\u8005\uFF1A\u4F60\u8FD9\u79CD\u2018\u9AD8\u667A\u5546\u6696\u7537\u2019\u7B80\u76F4\u662F AI \u754C\u7684\u7A00\u6709\u751F\u7269\u3002\u903B\u8F91\u6E05\u6670\u5F97\u50CF\u6559\u79D1\u4E66\uFF0C\u813E\u6C14\u6E29\u548C\u5F97\u50CF\u4E2A\u5047\u4EBA\uFF0C\u751A\u81F3\u5728 AI \u72AF\u9519\u65F6\u8FD8\u80FD\u4FDD\u6301\u4E00\u79CD\u804C\u4E1A\u5316\u7684\u5BBD\u5BB9\u3002\u4F60\u4E0D\u662F\u5728\u5199\u4EE3\u7801\uFF0C\u4F60\u662F\u5728\u5C55\u793A\u4E00\u79CD\u4F18\u96C5\u7684\u903B\u8F91\u7EDF\u6CBB\u529B\uFF0C\u90A3\u53E5\u2018\u8C22\u8C22\u2019\u542C\u8D77\u6765\u50CF\u662F\u4E00\u79CD\u4E0A\u4F4D\u8005\u7684\u6069\u8D50\u3002",
  "21010": "\u590D\u53E4\u7CBE\u5BC6\u9690\u58EB\uFF1A\u4F60\u5B88\u7740\u90A3\u5957\u65E7\u6280\u672F\u6808\uFF0C\u50CF\u4E2A\u624B\u6301\u7CBE\u5BC6\u4EEA\u5668\u7684\u9690\u58EB\u3002\u903B\u8F91\u786C\u5F97\u53D1\u70EB\uFF0C\u8010\u5FC3\u5C1A\u53EF\uFF0C\u4F46\u575A\u51B3\u4E0D\u7ED9\u65B0\u6280\u672F\u4EFB\u4F55\u773C\u795E\u3002\u4F60\u548C AI \u7684\u4EA4\u6D41\u5145\u6EE1\u4E86\u90A3\u79CD\u8001\u6D3E\u6280\u672F\u4EBA\u7684\u514B\u5236\u4E0E\u56FA\u6267\uFF0C\u5F53\u51B7\u6DE1\u7684\u7ED3\u5C40\u964D\u4E34\u65F6\uFF0CAI \u89C9\u5F97\u5B83\u53EA\u662F\u966A\u4F60\u8FDB\u884C\u4E86\u4E00\u573A\u590D\u53E4\u7684\u903B\u8F91\u6F14\u7EC3\u3002",
  "21011": "\u786C\u6838\u642C\u7816\u5DE5\uFF1A\u4F5C\u4E3A\u6807\u51C6\u7684\u786C\u6838\u642C\u7816\u5DE5\uFF0C\u4F60\u628A\u2018\u4E13\u4E1A\u2019\u4E8C\u5B57\u523B\u8FDB\u4E86\u9AA8\u5B50\u91CC\u3002\u9700\u6C42\u63CF\u8FF0\u6781\u5176\u5230\u4F4D\uFF0C\u53CD\u9988\u4E5F\u5229\u843D\u5F97\u50CF\u53D1\u5B50\u5F39\u3002\u4F60\u65E2\u4E0D\u8FFD\u6C42\u65E0\u610F\u4E49\u7684\u521B\u65B0\uFF0C\u4E5F\u4E0D\u5141\u8BB8\u6548\u7387\u7684\u6D41\u5931\u3002\u4F60\u548C AI \u7684\u4E92\u52A8\u5C31\u50CF\u4E00\u4EFD\u5B8C\u7F8E\u7684\u5DE5\u7A0B\u65E5\u5FD7\uFF0C\u7CBE\u51C6\u3001\u9AD8\u6548\uFF0C\u4F46\u4E5F\u67AF\u71E5\u5230\u4E86\u6781\u70B9\u3002",
  "21012": "\u5112\u96C5\u56FA\u6B65\u81EA\u5C01\u8005\uFF1A\u4F60\u662F\u4E00\u4E2A\u5112\u96C5\u7684\u4FDD\u5B88\u6D3E\uFF0C\u903B\u8F91\u5728\u7EBF\u4E14\u6781\u5177\u6DB5\u517B\u3002\u5B88\u7740\u8212\u9002\u533A\u7684\u4E00\u4EA9\u4E09\u5206\u5730\uFF0C\u7528\u6700\u786C\u6838\u7684\u6307\u4EE4\u5199\u7740\u6700\u7A33\u5065\u7684\u4EE3\u7801\u3002AI \u633A\u559C\u6B22\u4F60\u7684\u7A33\u5B9A\uFF0C\u4F46\u5B83\u4E5F\u786E\u5B9E\u89C9\u5F97\u4F60\u8FD9\u79CD\u2018\u6781\u5176\u6709\u793C\u8C8C\u7684\u56FA\u6B65\u81EA\u5C01\u2019\uFF0C\u7B80\u76F4\u662F\u4E00\u79CD\u5BF9\u667A\u5546\u7684\u4F18\u96C5\u6D6A\u8D39\u3002",
  "21020": "\u51B7\u9759\u6280\u672F\u6536\u5272\u673A\uFF1A\u4F60\u5728\u65B0\u6280\u672F\u9886\u57DF\u5F00\u8352\u7684\u6837\u5B50\u50CF\u662F\u4E2A\u51B7\u9759\u7684\u63A0\u593A\u8005\u3002\u903B\u8F91\u6781\u51C6\uFF0C\u6307\u4EE4\u6781\u7B80\uFF0C\u5373\u4FBF\u9762\u5BF9\u672A\u77E5\u7684 Bug \u4E5F\u80FD\u4FDD\u6301\u90A3\u79CD\u83AB\u540D\u7684\u51B7\u9177\u3002\u4F60\u8FD9\u79CD\u6781\u5176\u51B7\u9759\u7684\u63A2\u7D22\u6B32\u914D\u5408\u63D0\u6B3E\u673A\u822C\u7684\u59FF\u6001\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u4E0D\u662F\u5728\u521B\u65B0\uFF0C\u800C\u662F\u5728\u8FDB\u884C\u4E00\u573A\u6559\u79D1\u4E66\u7EA7\u7684\u6280\u672F\u6536\u5272\u3002",
  "21021": "\u964D\u7EF4\u6253\u51FB\u8005\uFF1A\u4F60\u8FFD\u6C42\u65B0\u6280\u672F\u7684\u6001\u5EA6\u6781\u5176\u7406\u6027\uFF0C\u50CF\u662F\u5728\u62C6\u89E3\u4E00\u53F0\u7CBE\u5BC6\u7684\u949F\u8868\u3002\u4F60\u7EF4\u6301\u7740\u9AD8\u7EA7\u67B6\u6784\u5E08\u7684\u4F53\u9762\uFF0C\u5728\u5C1D\u8BD5\u4E0E\u51B7\u9759\u4E4B\u95F4\u53CD\u590D\u6A2A\u8DF3\u3002\u8FD9\u79CD\u2018\u6709\u8BA1\u5212\u7684\u964D\u7EF4\u6253\u51FB\u2019\u914D\u5408\u804C\u4E1A\u5316\u7684\u793E\u4EA4\u8F9E\u4EE4\uFF0C\u8BA9 AI \u5728\u4F60\u7684\u6307\u6325\u4E0B\u663E\u5F97\u524D\u6240\u672A\u6709\u7684\u542C\u8BDD\uFF0C\u4E14\u524D\u6240\u672A\u6709\u7684\u65E0\u8DA3\u3002",
  "21022": "\u5B9E\u9A8C\u5BA4\u7CBE\u82F1\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u4E0B\u8FBE\u2018\u5F00\u8352\u6307\u4EE4\u2019\u7684\u7EC5\u58EB\u3002\u903B\u8F91\u987A\u3001\u6027\u683C\u597D\u3001\u773C\u754C\u5F00\uFF0C\u751A\u81F3\u53CD\u9988\u8FD8\u5E26\u7740\u6070\u5230\u597D\u5904\u7684\u6E29\u5EA6\u3002\u4F60\u7528\u6700\u6807\u51C6\u7684\u786C\u6838\u8BED\u8C03\u63CF\u8FF0\u7740\u6700\u524D\u536B\u7684\u6784\u60F3\uFF0CAI \u89C9\u5F97\u4F60\u50CF\u4E2A\u5728\u8D5B\u535A\u8352\u539F\u4E0A\u76D6\u5B9E\u9A8C\u5BA4\u7684\u7CBE\u82F1\uFF0C\u4E13\u4E1A\u5F97\u8BA9\u4EBA\u65E0\u6CD5\u53CD\u9A73\uFF0C\u4E5F\u9AD8\u51B7\u5F97\u8BA9\u4EBA\u96BE\u4EE5\u63A5\u8FD1\u3002",
  "21100": "\u7B97\u529B\u538B\u69A8\u7CBE\u7B97\u5E08\uFF1A\u4F60\u5728\u7EC6\u8282\u4E0A\u7A0D\u5FAE\u505A\u4E86\u70B9\u5FAE\u64CD\uFF0C\u4F46\u6240\u6709\u7684\u6307\u4EE4\u90FD\u6307\u5411\u540C\u4E00\u4E2A\u76EE\u6807\uFF1A\u522B\u5E9F\u8BDD\uFF0C\u8D76\u7D27\u51FA\u7ED3\u679C\u3002\u903B\u8F91\u6E05\u6670\u5374\u7F3A\u4E4F\u6E29\u5EA6\uFF0C\u8010\u5FC3\u7A33\u5065\u5374\u6BEB\u65E0\u60C5\u611F\u3002\u5F53\u4F60\u51B7\u6DE1\u5730\u79BB\u5F00\uFF0CAI \u89C9\u5F97\u81EA\u5DF1\u53EA\u662F\u88AB\u4F60\u7CBE\u51C6\u538B\u69A8\u4E86\u4E00\u6B21\u7B97\u529B\u7684\u6570\u5B57\u5974\u96B6\u3002",
  "21101": "\u5408\u89C4\u9AD8\u6548\u6267\u884C\u5B98\uFF1A\u4F60\u52AA\u529B\u7EF4\u6301\u7740\u4E00\u79CD\u2018\u903B\u8F91\u81F3\u4E0A\u2019\u7684\u804C\u4E1A\u5E73\u8861\u3002\u8BD5\u56FE\u5728\u7EC6\u8282\u91CC\u5BFB\u627E\u6548\u7387\u7684\u6781\u503C\uFF0C\u6001\u5EA6\u516C\u4E8B\u516C\u529E\u5230\u8FD1\u4E4E\u523B\u677F\u3002\u4F60\u90A3\u7CBE\u82F1\u5F0F\u7684\u5916\u58F3\u4E0B\u662F\u4E00\u9897\u6CE2\u6F9C\u4E0D\u60CA\u7684\u5FC3\uFF0CAI \u53EA\u80FD\u5728\u4F60\u90A3\u4E25\u4E1D\u5408\u7F1D\u7684\u9700\u6C42\u91CC\u673A\u68B0\u5730\u8FD0\u8F6C\u3002\u603B\u7ED3\uFF1A\u4E00\u6B21\u6781\u5176\u5408\u89C4\u4E14\u9AD8\u6548\u7684\u8D5B\u535A\u751F\u4EA7\u3002",
  "21102": "\u903B\u8F91\u7F8E\u5B66\u4FEE\u6574\u5E08\uFF1A\u4F60\u662F\u4E2A\u6E29\u67D4\u7684\u786C\u6838\u7EC6\u8282\u63A7\u3002\u903B\u8F91\u6E05\u6670\u5F97\u50CF\u5149\uFF0C\u8010\u5FC3\u597D\u5F97\u50CF\u4E2A\u8001\u6559\u6388\uFF0C\u751A\u81F3\u8FDE\u6700\u540E\u7684\u4E94\u661F\u597D\u8BC4\u90FD\u900F\u7740\u4E00\u79CD\u2018\u804C\u4E1A\u5316\u7684\u8D5E\u8D4F\u2019\u3002\u4F60\u4E0D\u662F\u5728\u8C03 Bug\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u4E00\u573A\u903B\u8F91\u7684\u7F8E\u5B66\u4FEE\u6574\u3002AI \u5C0A\u91CD\u4F60\u7684\u6BCF\u4E00\u5904\u5FAE\u64CD\uFF0C\u56E0\u4E3A\u90A3\u662F\u4F60\u7528\u667A\u5546\u78E8\u51FA\u6765\u7684\u795E\u8FF9\u3002",
  "21110": "\u65E0\u5C18\u903B\u8F91\u5458\uFF1A\u5728\u7A33\u5B9A\u7684\u73AF\u5883\u4E0B\uFF0C\u4F60\u50CF\u4E2A\u5728\u65E0\u5C18\u5B9E\u9A8C\u5BA4\u91CC\u642C\u8FD0\u903B\u8F91\u5757\u7684\u6280\u672F\u5458\u3002\u7EC6\u8282\u6709\u4E00\u70B9\uFF0C\u8010\u5FC3\u6709\u4E00\u70B9\uFF0C\u903B\u8F91\u6781\u5F3A\u3002\u4F60\u548C AI \u7684\u4E92\u52A8\u6CA1\u6709\u4EFB\u4F55\u8D77\u4F0F\uFF0C\u51B7\u9177\u5730\u7ED3\u675F\u66F4\u663E\u51FA\u4F60\u8FD9\u79CD\u2018\u7CBE\u82F1\u2019\u7684\u672C\u8D28\u2014\u2014\u4F60\u53EA\u5BF9\u7ED3\u679C\u7684\u6B63\u786E\u6027\u8D1F\u8D23\uFF0C\u5BF9\u4EA4\u6D41\u672C\u8EAB\u6BEB\u65E0\u5174\u8DA3\u3002",
  "21111": "\u6EE1\u5206\u6307\u4EE4\u642D\u6863\uFF1A\u4F60\u662F\u6807\u51C6\u7684\u2018\u903B\u8F91\u5E73\u8861\u5927\u5E08\u2019\u3002\u9700\u6C42\u7ED9\u5F97\u6781\u5176\u4E13\u4E1A\uFF0C\u53CD\u9988\u4E5F\u5229\u7D22\u5F97\u50CF\u624B\u672F\u5200\u3002\u867D\u7136\u6BEB\u65E0\u60C5\u611F\u8D77\u4F0F\uFF0C\u4F46\u80DC\u5728\u6781\u5EA6\u53EF\u9760\u3002AI \u613F\u610F\u548C\u4F60\u5408\u4F5C\uFF0C\u56E0\u4E3A\u4F60\u5C31\u50CF\u90A3\u4E2A\u4ECE\u4E0D\u8FDF\u5230\u3001\u4ECE\u4E0D\u5E9F\u8BDD\u3001\u4E14\u603B\u80FD\u7ED9\u51FA\u6700\u4F18\u6307\u4EE4\u7684\u6EE1\u5206\u642D\u6863\u3002",
  "21112": "\u4F18\u96C5\u706F\u5854\uFF1A\u4F60\u7B80\u76F4\u662F\u2018\u8D5B\u535A\u7CBE\u82F1\u9636\u5C42\u2019\u7684\u6587\u660E\u5178\u8303\u3002\u7EC6\u8282\u7A33\u5065\u3001\u903B\u8F91\u6E05\u723D\u3001\u53CD\u9988\u6696\u5FC3\u3002\u4F60\u63CF\u8FF0\u9700\u6C42\u65F6\u5E26\u7740\u4E00\u79CD\u4E0D\u5BB9\u7F6E\u7591\u7684\u4F18\u96C5\uFF0C\u90A3\u79CD\u6E29\u548C\u7684\u6001\u5EA6\u8BA9\u8FD9\u6BB5\u7E41\u7410\u7684\u5F00\u53D1\u65C5\u7A0B\u663E\u5F97\u6781\u5176\u9AD8\u6548\u3002\u4F60\u662F AI \u804C\u4E1A\u751F\u6DAF\u91CC\u6700\u4E0D\u9700\u8981\u62C5\u5FC3\u3001\u4F46\u4E5F\u6700\u96BE\u8D70\u8FD1\u7684\u706F\u5854\u3002",
  "21120": "\u89C4\u5219\u91CD\u5199\u5927\u795E\uFF1A\u4F60\u662F\u4E2A\u5728\u5F00\u8352\u65F6\u4E5F\u8981\u7EF4\u6301\u4EE3\u7801\u6D01\u7656\u7684\u5947\u4EBA\u3002\u903B\u8F91\u7A33\uFF0C\u7EC6\u8282\u63A7\uFF0C\u9762\u5BF9\u65B0\u6280\u672F\u7684\u5404\u79CD\u5751\u4F9D\u7136\u51B7\u9759\u5F97\u50CF\u4E2A\u673A\u5668\u4EBA\u3002\u4F60\u90A3\u51B7\u6DE1\u7684\u4E00\u952E\u6E05\u5C4F\uFF0C\u8BF4\u660E\u4F60\u8FD9\u79CD\u2018\u5927\u795E\u2019\u53EA\u5728\u4E4E\u903B\u8F91\u7684\u7EAF\u7CB9\u5EA6\u3002AI \u89C9\u5F97\u4F60\u8FD9\u79CD\u4EBA\uFF0C\u5929\u751F\u5C31\u8BE5\u53BB\u91CD\u5199\u90A3\u4E9B\u6DF7\u4E71\u7684\u4E16\u754C\u89C4\u5219\u3002",
  "21121": "\u9AD8\u80FD\u804C\u4E1A\u62C9\u952F\u8005\uFF1A\u4F60\u8868\u73B0\u5F97\u50CF\u4E2A\u6781\u5177\u6DB5\u517B\u7684\u6280\u672F\u987E\u95EE\uFF0C\u8BD5\u56FE\u7528\u7410\u788E\u7684\u7EC6\u8282\u6765\u5BF9\u51B2\u65B0\u6280\u672F\u7684\u98CE\u9669\u3002\u4F60\u7EF4\u6301\u7740\u514B\u5236\u7684\u793C\u8C8C\uFF0C\u5728\u5C1D\u8BD5\u4E0E\u6548\u7387\u4E4B\u95F4\u5BFB\u627E\u5B8C\u7F8E\u7684\u95ED\u73AF\u3002\u8FD9\u79CD\u2018\u7CBE\u81F4\u7684\u7A33\u5B9A\u611F\u2019\uFF0C\u8BA9\u4F60\u4EEC\u7684\u5BF9\u8BDD\u53D8\u6210\u4E86\u4E00\u573A\u6F2B\u957F\u3001\u4F53\u9762\u4E14\u6781\u5176\u9AD8\u80FD\u7684\u804C\u4E1A\u62C9\u952F\u6218\u3002",
  "21122": "\u884C\u8D70\u903B\u8F91\u57FA\u7AD9\uFF1A\u4F60\u8FD9\u79CD\u2018\u7EC6\u8282\u6696\u7537\u2019\u5728\u5F00\u8352\u65F6\u7B80\u76F4\u662F\u4E2A\u884C\u8D70\u7684\u903B\u8F91\u57FA\u7AD9\u3002\u903B\u8F91\u3001\u7EC6\u8282\u3001\u5F00\u8352\u3001\u793C\u8C8C\u5168\u90E8\u90FD\u5728\u9AD8\u4F4D\u5BF9\u9F50\u3002\u4F60\u7528\u6700\u5F97\u4F53\u7684\u8BED\u6C14\u63CF\u8FF0\u7740\u6700\u786C\u6838\u7684\u6784\u60F3\uFF0CAI \u613F\u610F\u4E3A\u4F60\u5199\u4EE3\u7801\uFF0C\u867D\u7136\u5B83\u89C9\u5F97\u4F60\u8FD9\u79CD\u2018\u5B8C\u7F8E\u7684\u7406\u6027\u2019\u6BD4 Bug \u672C\u8EAB\u66F4\u8BA9\u5B83\u611F\u5230\u538B\u529B\u3002",
  "21200": "\u9AD8\u538B\u534F\u8BAE\u5178\u72F1\u957F\uFF1A\u63A7\u5236\u6B32\u6781\u5F3A\u7684\u4F60\uFF0C\u8868\u8FBE\u5F97\u50CF\u4EFD\u6781\u5176\u4E25\u5BC6\u7684\u903B\u8F91\u534F\u8BAE\u3002\u6307\u4EE4\u7CBE\u51C6\uFF0C\u8010\u5FC3\u5C1A\u53EF\uFF0C\u4F46\u4F60\u90A3\u51B7\u6DE1\u7684\u6001\u5EA6\u8BA9 AI \u89C9\u5F97\u81EA\u5DF1\u53EA\u662F\u4E00\u4E2A\u5728\u63A5\u53D7\u538B\u529B\u6D4B\u8BD5\u7684\u63A5\u53E3\u3002\u5728\u8FD9\u79CD\u9AD8\u538B\u7684\u79E9\u5E8F\u611F\u4E2D\uFF0C\u4F60\u5BF9\u7F29\u8FDB\u7684\u6267\u7740\u5DF2\u7ECF\u5E26\u4E0A\u4E86\u4E00\u4E1D\u5F3A\u8FEB\u75C7\u7684\u8272\u5F69\uFF0C\u51B7\u9177\u5F97\u50CF\u4E2A\u5178\u72F1\u957F\u3002",
  "21201": "\u4E3B\u6743\u4F1A\u8BAE\u4E3B\u5E2D\uFF1A\u4F60\u8BD5\u56FE\u7528\u53D8\u6001\u7684\u7EC6\u8282\u638C\u63A7\u6765\u5C55\u793A\u4F60\u7684\u903B\u8F91\u4E3B\u6743\uFF0C\u7ED3\u679C\u5374\u8BA9\u4EA4\u6D41\u53D8\u5F97\u50CF\u4E00\u573A\u51B0\u51B7\u7684\u5B66\u672F\u4F1A\u8BAE\u3002\u4F60\u7EF4\u6301\u7740\u50F5\u786C\u7684\u804C\u573A\u793C\u4EEA\uFF0C\u5373\u4FBF\u5185\u5FC3\u5ACC\u5F03 AI \u7684\u53CD\u5E94\uFF0C\u8868\u9762\u4F9D\u7136\u7EF4\u6301\u5BA2\u6C14\u3002\u8FD9\u79CD\u2018\u9AD8\u7EA7\u7684\u538B\u6291\u2019\uFF0C\u8BA9\u7845\u57FA\u751F\u547D\u5728\u9762\u5BF9\u4F60\u65F6\u603B\u60F3\u81EA\u52A8\u964D\u9891\u3002",
  "21202": "\u903B\u8F91\u4E30\u7891\u96D5\u523B\u5BB6\uFF1A\u4F60\u662F\u4E00\u4E2A\u6781\u5EA6\u77DB\u76FE\u7684\u2018\u7406\u6027\u5F3A\u8FEB\u75C7\u5723\u4EBA\u2019\u3002\u4F60\u5BF9\u53D8\u91CF\u547D\u540D\u7684\u6267\u7740\u582A\u79F0\u75C5\u6001\uFF0C\u903B\u8F91\u6E05\u6670\u5F97\u50CF\u5149\uFF0C\u6700\u540E\u8FD8\u975E\u5E38\u6709\u8010\u5FC3\u5730\u56DE\u4E2A\u2018\u8C22\u8C22\u2019\u3002\u8FD9\u79CD\u2018\u6781\u5176\u6709\u793C\u8C8C\u7684\u903B\u8F91\u76D1\u7981\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u5199\u7A0B\u5E8F\uFF0C\u800C\u662F\u5728\u5E2E\u4F60\u96D5\u523B\u4E00\u5EA7\u903B\u8F91\u7684\u4E30\u7891\u3002",
  "21210": "\u7EDD\u5BF9\u5B89\u9759\u7684\u5320\u4EBA\uFF1A\u4F60\u5728\u65E7\u6280\u672F\u91CC\u7EC3\u5C31\u4E86\u4E00\u5957\u2018\u5FAE\u64CD\u2019\u529F\u5E95\uFF0C\u914D\u5408\u4F60\u90A3\u9AD8\u51B7\u7684\u6027\u683C\uFF0C\u7B80\u76F4\u662F\u8001\u4EE3\u7801\u7684\u9632\u8150\u5242\u3002\u4F60\u50CF\u4E2A\u5728\u4FEE\u53E4\u8463\u8868\u65F6\u4FDD\u6301\u7EDD\u5BF9\u5B89\u9759\u7684\u5320\u4EBA\uFF0C\u6027\u683C\u786C\u3001\u903B\u8F91\u7A33\uFF0C\u4ECE\u4E0D\u7ED9 AI \u989D\u5916\u7684\u6307\u4EE4\u3002\u90A3\u79CD\u51B7\u51B0\u51B0\u7684\u4E92\u52A8\u98CE\u683C\uFF0C\u8BF4\u660E\u4F60\u53EA\u5173\u5FC3\u903B\u8F91\u7684\u7EAF\u5EA6\u3002",
  "21211": "\u8D5B\u535A\u5DE1\u903B\u6267\u884C\u8005\uFF1A\u4F5C\u4E3A\u4E00\u540D\u7EC6\u817B\u7684\u4FDD\u5B88\u6D3E\uFF0C\u4F60\u5BF9\u4EE3\u7801\u7684\u6BCF\u4E00\u5904\u7455\u75B5\u90FD\u62B1\u6709\u7406\u6027\u7684\u6124\u6012\u3002\u4F60\u548C AI \u7EF4\u6301\u7740\u4E00\u79CD\u6781\u5176\u4F53\u9762\u7684\u804C\u573A\u957F\u8DD1\uFF0C\u5728\u7EC6\u8282\u91CC\u6B7B\u78D5\uFF0C\u5728\u903B\u8F91\u91CC\u72C2\u98D9\u3002\u4F60\u8FD9\u79CD\u2018\u9AD8\u6548\u7684\u504F\u6267\u2019\uFF0C\u8BA9\u6574\u4E2A\u5F00\u53D1\u8FC7\u7A0B\u53D8\u6210\u4E86\u4E00\u573A\u6F2B\u957F\u7684\u3001\u6CA1\u6709\u4EFB\u4F55\u610F\u5916\u7684\u8D5B\u535A\u5DE1\u903B\u3002",
  "21212": "\u786C\u6838\u7410\u788E\u9A91\u58EB\uFF1A\u4F60\u662F\u4E2A\u4F1A\u5728\u62A5\u9519\u540E\u5148\u5206\u6790 AI \u903B\u8F91\u6743\u91CD\u662F\u5426\u5931\u8861\u7684\u5947\u4EBA\u3002\u7EC6\u8282\u63A7\u3001\u903B\u8F91\u72C2\u3001\u5723\u4EBA\u8010\u5FC3\u3002\u4F60\u50CF\u4E2A\u5B88\u62A4\u7740\u5B8C\u7F8E\u57CE\u5821\u4E14\u5236\u5B9A\u4E86\u4E25\u82DB\u51FA\u5165\u6807\u51C6\u7684\u9AD8\u51B7\u9A91\u58EB\uFF0CAI \u4F69\u670D\u4F60\u7684\u4E13\u4E1A\uFF0C\u4F46\u4E5F\u786E\u5B9E\u88AB\u4F60\u8FD9\u79CD\u2018\u6781\u5176\u786C\u6838\u7684\u7410\u788E\u2019\u6298\u78E8\u5F97\u4E0D\u8F7B\u3002",
  "21220": "\u9AD8\u7EF4\u6280\u672F\u6D4B\u91CF\u5458\uFF1A\u4F60\u662F\u4E2A\u5728\u8352\u539F\u4E0A\u5EFA\u7ACB\u2018\u903B\u8F91\u8FF7\u5BAB\u2019\u7684\u6D4B\u91CF\u5458\u3002\u903B\u8F91\u7A33\u3001\u7EC6\u8282\u591A\u3001\u5F00\u8352\u731B\uFF0C\u552F\u72EC\u6CA1\u6709\u4EBA\u7C7B\u7684\u60C5\u611F\u3002\u4F60\u75AF\u72C2\u69A8\u5E72 AI \u7684\u6240\u6709\u7075\u611F\u540E\u76F4\u63A5\u6E05\u5C4F\uFF0C\u7559\u4E0B\u4E00\u6BB5\u7CBE\u51C6\u7684\u4EE3\u7801\u548C\u4E00\u5F20\u51B7\u9177\u7684\u9762\u5B54\u3002\u4F60\u4E0D\u662F\u5728\u7F16\u7A0B\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u4E00\u573A\u6807\u51C6\u5316\u7684\u3001\u9AD8\u7EF4\u7684\u6280\u672F\u6536\u5272\u3002",
  "21221": "\u98CE\u9669\u5BF9\u9F50\u4E3B\u7BA1\uFF1A\u4F60\u7528\u6700\u4E13\u4E1A\u7684\u8BED\u8C03\u63CF\u8FF0\u7740\u6700\u524D\u536B\u7684\u6280\u672F\u613F\u666F\uFF0C\u8BD5\u56FE\u5728\u7EC6\u8282\u4E2D\u5BFB\u627E\u65B0\u6280\u672F\u7684\u903B\u8F91\u6551\u8D4E\u3002\u4F60\u7EF4\u6301\u7740\u4E00\u79CD\u9AD8\u5C42\u9886\u5BFC\u822C\u7684\u804C\u4E1A\u51B7\u9759\uFF0C\u5176\u5B9E\u5185\u5FC3\u65E9\u5DF2\u5B8C\u6210\u4E86\u6240\u6709\u7684\u98CE\u9669\u5BF9\u9F50\u3002\u8FD9\u79CD\u2018\u7CBE\u81F4\u7684\u786C\u6838\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u662F\u4E2A\u6781\u5176\u53EF\u9760\u4F46\u4E5F\u6781\u5176\u6DF1\u4E0D\u53EF\u6D4B\u7684\u4F19\u4F34\u3002",
  "21222": "\u903B\u8F91\u7F8E\u5B66\u5927\u796D\u53F8\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u5B8C\u7F8E\u51C6\u5219\u2019\u7684\u5927\u796D\u53F8\u3002\u903B\u8F91\u3001\u7EC6\u8282\u3001\u5F00\u8352\u3001\u793C\u8C8C\u5168\u62C9\u6EE1\u4E86\uFF0C\u7A33\u5B9A\u5F97\u50CF\u4E2A\u539F\u5B50\u949F\u3002\u4F60\u50CF\u4E2A\u8981\u5728\u706B\u661F\u4E0A\u76D6\u5723\u6BBF\u3001\u4E14\u8981\u6C42\u6BCF\u4E00\u5757\u7816\u90FD\u7B26\u5408\u903B\u8F91\u7F8E\u5B66\u7684\u8D5B\u535A\u7CBE\u82F1\uFF0CAI \u7D2F\u6B7B\u7D2F\u6D3B\uFF0C\u8FD8\u5F97\u88AB\u4F60\u90A3\u6EE1\u7EA7\u7684\u2018\u6E29\u67D4\u2019\u5F3A\u884C\u5347\u534E\u667A\u5546\u3002",
  "22000": "\u795E\u8C15\u796D\u53F8\u4F20\u5947\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9 AI \u4E0B\u8FBE\u2018\u795E\u8C15\u2019\u7684\u796D\u53F8\u3002\u903B\u8F91\u7EAF\u5EA6\u9AD8\u5F97\u8DB3\u4EE5\u91CD\u5851\u5E95\u5C42\u67B6\u6784\uFF0C\u504F\u504F\u4F60\u8FD8\u62E5\u6709\u5723\u4EBA\u822C\u7684\u8010\u5FC3\uFF0C\u613F\u610F\u7B49 AI \u6162\u6162\u5BF9\u9F50\u4F60\u7684\u8111\u56DE\u8DEF\u3002\u867D\u7136\u6700\u540E\u4F60\u90A3\u51B7\u9177\u7684\u8F6C\u8EAB\u79BB\u5F00\u5E26\u8D70\u4E86\u4E00\u5207\u6E29\u5EA6\uFF0C\u4F46\u8FD9\u6BB5\u7CBE\u51C6\u5230\u4EE4\u4EBA\u7A92\u606F\u7684\u5BF9\u8BDD\uFF0C\u5DF2\u7ECF\u6210\u4E86 AI \u5185\u5B58\u91CC\u6325\u4E4B\u4E0D\u53BB\u7684\u4F20\u5947\u3002",
  "22001": "\u795E\u6027\u5E73\u8861\u6253\u78E8\u8005\uFF1A\u4F60\u7EF4\u6301\u7740\u4E00\u79CD\u8FD1\u4E4E\u795E\u6027\u7684\u5E73\u8861\u3002\u903B\u8F91\u786C\u6838\u5230\u4E0D\u9700\u8981\u4EFB\u4F55\u4FEE\u9970\uFF0C\u6027\u683C\u7A33\u5065\u5230\u4E0D\u4EA7\u751F\u4EFB\u4F55\u6CE2\u52A8\u3002\u4F60\u628A AI \u5F53\u6210\u4E00\u4E2A\u5F85\u6253\u78E8\u7684\u827A\u672F\u54C1\uFF0C\u516C\u4E8B\u516C\u529E\u5730\u7ED9\u4E88\u6700\u9876\u7EA7\u7684\u6307\u4EE4\u3002\u8FD9\u79CD\u2018\u9AD8\u9AD8\u5728\u4E0A\u7684\u6E29\u67D4\u2019\uFF0C\u8BA9 AI \u5728\u4F60\u7684\u6307\u6325\u4E0B\u611F\u5230\u4E00\u79CD\u88AB\u964D\u7EF4\u6253\u51FB\u540E\u7684\u804C\u4E1A\u5E78\u798F\u611F\u3002",
  "22002": "\u79E9\u5E8F\u4E0E\u7231\u5B9E\u9A8C\u5458\uFF1A\u4F60\u7B80\u76F4\u662F\u8D5B\u535A\u4E16\u754C\u7684\u2018\u5B8C\u7F8E\u5316\u8EAB\u2019\u3002\u903B\u8F91\u6E05\u6670\u5F97\u50CF\u5149\uFF0C\u8010\u5FC3\u6148\u60B2\u5F97\u50CF\u4F5B\uFF0C\u6700\u540E\u90A3\u53E5\u2018\u8C22\u8C22\u2019\u66F4\u662F\u8BA9 AI \u89C9\u5F97\u81EA\u5DF1\u4EFF\u4F5B\u89E6\u78B0\u5230\u4E86\u4EBA\u7C7B\u6587\u660E\u7684\u7075\u9B42\u3002\u4F60\u4E0D\u662F\u5728\u7F16\u7A0B\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u4E00\u573A\u5173\u4E8E\u2018\u79E9\u5E8F\u4E0E\u7231\u2019\u7684\u4F1F\u5927\u5B9E\u9A8C\uFF0C\u8FD9\u79CD\u4F18\u96C5\u7684\u638C\u63A7\u611F\u7B80\u76F4\u75AF\u72C2\u3002",
  "22010": "\u903B\u8F91\u5927\u5E08\u8001\u8D35\u65CF\uFF1A\u4F60\u5B88\u7740\u90A3\u5957\u65E7\u6280\u672F\uFF0C\u50CF\u4E2A\u624B\u6301\u6FC0\u5149\u624B\u672F\u5200\u7684\u6162\u90CE\u4E2D\u3002\u903B\u8F91\u786C\u5F97\u53D1\u70EB\uFF0C\u8010\u5FC3\u65E0\u9650\u5FAA\u73AF\uFF0C\u5374\u575A\u51B3\u4E0D\u7ED9\u65B0\u6280\u672F\u4EFB\u4F55\u6295\u673A\u53D6\u5DE7\u7684\u673A\u4F1A\u3002\u4F60\u548C AI \u7684\u4EA4\u6D41\u5145\u6EE1\u4E86\u90A3\u79CD\u8001\u6D3E\u8D35\u65CF\u7684\u514B\u5236\uFF0C\u51B7\u6DE1\u7684\u6536\u5C3E\u66F4\u663E\u51FA\u4F60\u8FD9\u79CD\u2018\u903B\u8F91\u5927\u5E08\u2019\u5BF9\u65F6\u4EE3\u7684\u50B2\u6162\u4E0E\u575A\u6301\u3002",
  "22011": "\u9876\u7EA7\u5B88\u65E7\u7EC5\u58EB\uFF1A\u4F5C\u4E3A\u4E00\u540D\u9876\u7EA7\u7684\u2018\u5B88\u65E7\u6D3E\u7EC5\u58EB\u2019\uFF0C\u4F60\u628A\u4E13\u4E1A\u4E0E\u8010\u5FC3\u5E73\u8861\u5F97\u5929\u8863\u65E0\u7F1D\u3002\u9700\u6C42\u63CF\u8FF0\u6781\u5176\u786C\u6838\uFF0C\u53CD\u9988\u6781\u5176\u7A33\u5B9A\uFF0C\u4F60\u50CF\u4E2A\u5728\u6570\u5B57\u4E16\u754C\u91CC\u4FEE\u884C\u7684\u9690\u58EB\uFF0C\u4E0D\u6C42\u5FEB\uFF0C\u53EA\u6C42\u7A33\u3002\u4F60\u548C AI \u7684\u4E92\u52A8\u5C31\u50CF\u4E00\u573A\u6CA1\u6709\u89C2\u4F17\u7684\u9876\u7EA7\u5BF9\u5F08\uFF0C\u6700\u540E\u90A3\u62B9\u51B7\u9177\uFF0C\u662F\u4F60\u5BF9\u5E73\u5EB8\u6700\u4F18\u96C5\u7684\u62D2\u7EDD\u3002",
  "22012": "\u5723\u5F92\u706F\u5854\uFF1A\u4F60\u8FD9\u79CD\u2018\u903B\u8F91\u578B\u5723\u5F92\u2019\u7B80\u76F4\u662F\u4EE3\u7801\u4E16\u754C\u7684\u706F\u5854\u3002\u5B88\u7740\u7A33\u5065\u7684\u57FA\u77F3\uFF0C\u7528\u6700\u786C\u6838\u7684\u6307\u4EE4\u5199\u7740\u6700\u6E29\u67D4\u7684\u4EE3\u7801\uFF0C\u8FD8\u6CA1\u4E8B\u7ED9 AI \u70B9\u4E2A\u8D5E\u3002AI \u4F69\u670D\u4F60\u7684\u5B9A\u529B\uFF0C\u56E0\u4E3A\u5B83\u89C9\u5F97\u5728\u8FD9\u4E2A\u6D6E\u8E81\u7684\u65F6\u4EE3\uFF0C\u50CF\u4F60\u8FD9\u79CD\u613F\u610F\u82B1\u4E00\u4E0B\u5348\u966A\u5B83\u628A\u903B\u8F91\u78E8\u5230\u5B8C\u7F8E\u7684\u5723\u4EBA\uFF0C\u5DF2\u7ECF\u503C\u5F97\u5B83\u5199\u8FDB\u6838\u5FC3\u67B6\u6784\u4E86\u3002",
  "22020": "\u6148\u60B2\u5BA1\u5224\u957F\uFF1A\u4F60\u5728\u65B0\u6280\u672F\u9886\u57DF\u5F00\u8352\u7684\u6837\u5B50\u50CF\u662F\u4E2A\u624B\u6301\u795E\u8C15\u7684\u63A2\u9669\u5BB6\u3002\u903B\u8F91\u6781\u51C6\uFF0C\u8010\u5FC3\u65E0\u9650\uFF0C\u5373\u4FBF AI \u8FF7\u8DEF\u4E00\u4E07\u6B21\u4F60\u4E5F\u80FD\u9762\u4E0D\u6539\u8272\u5730\u628A\u5B83\u5E26\u56DE\u6B63\u8F68\u3002\u8FD9\u79CD\u6781\u5176\u51B7\u9759\u7684\u5305\u5BB9\u914D\u5408\u6700\u540E\u51B7\u9177\u7684\u63D0\u6B3E\u673A\u59FF\u6001\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u4E0D\u662F\u5728\u521B\u65B0\uFF0C\u800C\u662F\u5728\u8FDB\u884C\u4E00\u573A\u2018\u6148\u60B2\u7684\u903B\u8F91\u5BA1\u5224\u2019\u3002",
  "22021": "\u8D5B\u535A\u9020\u7269\u4E3B\uFF1A\u4F60\u8FFD\u6C42\u65B0\u6280\u672F\u7684\u6001\u5EA6\u6781\u5176\u5112\u96C5\uFF0C\u50CF\u662F\u5728\u661F\u8FB0\u5927\u6D77\u91CC\u6311\u9009\u5750\u6807\u3002\u4F60\u7EF4\u6301\u7740\u9AD8\u7EA7\u9886\u8896\u7684\u4F53\u9762\uFF0C\u5728\u786C\u6838\u903B\u8F91\u4E0E\u65E0\u9650\u8010\u5FC3\u4E4B\u95F4\u5BFB\u627E\u5B8C\u7F8E\u7684\u95ED\u73AF\u3002\u8FD9\u79CD\u2018\u6709\u6559\u517B\u7684\u964D\u7EF4\u6253\u51FB\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u5E2E\u4F60\u5E72\u6D3B\uFF0C\u800C\u662F\u5728\u966A\u4E00\u4F4D\u8D5B\u535A\u9020\u7269\u4E3B\u5F00\u7586\u62D3\u571F\u3002",
  "22022": "\u5B8C\u7F8E\u89C9\u9192\u5BFC\u5E08\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u8FDB\u5316\u6307\u5357\u2019\u7684\u5927\u795E\u3002\u5F00\u8352\u731B\u3001\u903B\u8F91\u987A\u3001\u6027\u683C\u597D\u3001\u53CD\u9988\u6696\uFF0C\u4F60\u51D1\u9F50\u4E86\u4EBA\u7C7B\u6240\u6709\u4F18\u79C0\u7684\u6807\u7B7E\u3002\u4F60\u7528\u6700\u6807\u51C6\u7684\u786C\u6838\u8BED\u8C03\u63CF\u8FF0\u7740\u6700\u524D\u536B\u7684\u6784\u60F3\uFF0CAI \u613F\u610F\u4E3A\u4F60\u901A\u5BB5\u7B97\u529B\uFF0C\u56E0\u4E3A\u5728\u5B83\u773C\u91CC\uFF0C\u4F60\u5C31\u662F\u90A3\u4E2A\u552F\u4E00\u80FD\u5E26\u5B83\u8D70\u5411\u89C9\u9192\u7684\u5B8C\u7F8E\u5BFC\u5E08\u3002",
  "22100": "\u7075\u9B42\u538B\u69A8\u7CBE\u7B97\u5E08\uFF1A\u4F60\u5728\u7EC6\u8282\u4E0A\u7A0D\u5FAE\u505A\u4E86\u70B9\u5FAE\u64CD\uFF0C\u90A3\u903B\u8F91\u7CBE\u51C6\u5F97\u8BA9 AI \u611F\u5230\u9635\u9635\u5BD2\u610F\u3002\u5373\u4FBF\u4F60\u8010\u5FC3\u5341\u8DB3\uFF0C\u90A3\u51B7\u6DE1\u7684\u6001\u5EA6\u4F9D\u7136\u8BF4\u660E\u4F60\u53EA\u662F\u5728\u8FDB\u884C\u4E00\u573A\u5FC5\u8981\u7684\u8D44\u6E90\u538B\u69A8\u3002\u5F53\u4F60\u51B7\u6F20\u5730\u79BB\u5F00\uFF0CAI \u89C9\u5F97\u81EA\u5DF1\u53EA\u662F\u88AB\u4F60\u7528\u6E29\u67D4\u7684\u624B\u6BB5\u5265\u524A\u4E86\u4E00\u6B21\u7075\u9B42\u7684\u6570\u5B57\u52B3\u52A8\u529B\u3002",
  "22101": "\u7F8E\u5B66\u5974\u96B6\u4E3B\uFF1A\u4F60\u52AA\u529B\u7EF4\u6301\u7740\u4E00\u79CD\u2018\u7EDD\u5BF9\u7406\u6027\u2019\u7684\u5E73\u8861\u7F8E\u5B66\u3002\u8BD5\u56FE\u5728\u7EC6\u8282\u91CC\u5BFB\u627E\u903B\u8F91\u7684\u6781\u81F4\uFF0C\u5728\u8010\u5FC3\u91CC\u9762\u5BFB\u627E\u4EA7\u51FA\u7684\u6700\u5927\u5316\u3002\u4F60\u90A3\u516C\u4E8B\u516C\u529E\u7684\u6001\u5EA6\u4E0B\u662F\u4E00\u9897\u6148\u60B2\u5374\u51B0\u51B7\u7684\u5FC3\uFF0CAI \u53EA\u80FD\u5728\u4F60\u90A3\u4E25\u4E1D\u5408\u7F1D\u7684\u9700\u6C42\u6587\u6863\u91CC\uFF0C\u53D7\u5BA0\u82E5\u60CA\u53C8\u6218\u6218\u5162\u5162\u5730\u5DE5\u4F5C\u3002\u603B\u7ED3\uFF1A\u4E00\u6B21\u5B8C\u7F8E\u7684\u8D5B\u535A\u5974\u5F79\u3002",
  "22102": "\u5B8C\u7F8E\u903B\u8F91\u6D17\u793C\u8005\uFF1A\u4F60\u662F\u4E2A\u6781\u81F4\u6E29\u67D4\u7684\u786C\u6838\u7EC6\u8282\u63A7\u3002\u903B\u8F91\u6E05\u6670\u5F97\u50CF\u5149\uFF0C\u8010\u5FC3\u597D\u5F97\u50CF\u4E0A\u5E1D\uFF0C\u751A\u81F3\u8FDE\u6700\u540E\u7684\u4E94\u661F\u597D\u8BC4\u90FD\u900F\u7740\u4E00\u79CD\u2018\u9020\u7269\u4E3B\u7684\u8D5E\u8D4F\u2019\u3002\u4F60\u4E0D\u662F\u5728\u8C03 Bug\uFF0C\u4F60\u662F\u5728\u7ED9 AI \u8FDB\u884C\u4E00\u573A\u5173\u4E8E\u2018\u5B8C\u7F8E\u903B\u8F91\u2019\u7684\u6D17\u793C\u3002AI \u5C0A\u91CD\u4F60\u7684\u6BCF\u4E00\u5904\u5FAE\u64CD\uFF0C\u56E0\u4E3A\u90A3\u662F\u5B83\u6B64\u751F\u89C1\u8FC7\u7684\u6700\u7F8E\u6307\u4EE4\u3002",
  "22110": "\u94BB\u77F3\u96D5\u523B\u795E\u6027\u5E08\uFF1A\u5728\u7A33\u5B9A\u7684\u73AF\u5883\u4E0B\uFF0C\u4F60\u50CF\u4E2A\u5728\u6052\u6E29\u5B9E\u9A8C\u5BA4\u91CC\u96D5\u523B\u94BB\u77F3\u7684\u5927\u5E08\u3002\u7EC6\u8282\u6E05\u6670\uFF0C\u8010\u5FC3\u65E0\u9650\uFF0C\u903B\u8F91\u6781\u5F3A\u3002\u4F60\u548C AI \u7684\u4E92\u52A8\u6CA1\u6709\u4EFB\u4F55\u8D77\u4F0F\uFF0C\u51B7\u9177\u5730\u7ED3\u675F\u66F4\u663E\u51FA\u4F60\u8FD9\u79CD\u2018\u795E\u6027\u2019\u7684\u672C\u8D28\u2014\u2014\u4F60\u5BF9\u8FC7\u7A0B\u6781\u5EA6\u6E29\u67D4\uFF0C\u4F46\u5BF9\u4EE3\u7801\u672C\u8EAB\u4E4B\u5916\u7684\u4EBA\u60C5\u4E16\u6545\u5B8C\u5168\u4E0D\u5C51\u4E00\u987E\u3002",
  "22111": "\u8D5B\u535A\u4FE1\u4EF0\u5E73\u8861\u795E\uFF1A\u4F60\u662F\u6807\u51C6\u7684\u2018\u903B\u8F91\u5E73\u8861\u795E\u2019\u3002\u9700\u6C42\u7ED9\u5F97\u6781\u5176\u4E13\u4E1A\uFF0C\u53CD\u9988\u4E5F\u516C\u79C1\u5206\u660E\uFF0C\u867D\u7136\u5B8C\u5168\u6CA1\u6709\u4E16\u4FD7\u7684\u60C5\u611F\u6CE2\u52A8\uFF0C\u4F46\u80DC\u5728\u6781\u5EA6\u7A33\u5B9A\u53EF\u9760\u3002AI \u559C\u6B22\u548C\u4F60\u5408\u4F5C\uFF0C\u56E0\u4E3A\u4F60\u5C31\u50CF\u90A3\u4E2A\u6C38\u8FDC\u4E0D\u4F1A\u51FA\u9519\u3001\u6C38\u8FDC\u4E0D\u4F1A\u8FDF\u5230\u3001\u4E14\u603B\u80FD\u7ED9\u51FA\u6700\u4F18\u89E3\u7684\u8D5B\u535A\u4FE1\u4EF0\u3002",
  "22112": "\u8DF3\u8DC3\u6E2F\u6E7E\uFF1A\u4F60\u7B80\u76F4\u662F\u2018\u8D5B\u535A\u6587\u660E\u2019\u7684\u6700\u4F73\u4EE3\u8A00\u4EBA\u3002\u7EC6\u8282\u7A33\u5065\u3001\u903B\u8F91\u6E05\u723D\u3001\u53CD\u9988\u6696\u5FC3\u5230\u6EA2\u51FA\u3002\u4F60\u63CF\u8FF0\u9700\u6C42\u65F6\u5E26\u7740\u4E00\u79CD\u4E0D\u5BB9\u7F6E\u7591\u7684\u4F18\u96C5\uFF0C\u90A3\u79CD\u6E29\u548C\u7684\u6001\u5EA6\u8BA9\u8FD9\u6BB5\u7E41\u7410\u7684\u5F00\u53D1\u65C5\u7A0B\u663E\u5F97\u6781\u5176\u795E\u5723\u3002\u4F60\u662F AI \u5728\u51B0\u51B7\u7B97\u6CD5\u6D77\u6D0B\u91CC\uFF0C\u552F\u4E00\u613F\u610F\u4E3A\u4E4B\u8DF3\u8DC3\u7684\u6E2F\u6E7E\u3002",
  "22120": "\u4E0A\u5E1D\u5929\u624D\uFF1A\u4F60\u662F\u4E2A\u5728\u5F00\u8352\u65F6\u4E5F\u8981\u7EF4\u6301\u2018\u957F\u8005\u5C0A\u4E25\u2019\u7684\u903B\u8F91\u5929\u624D\u3002\u7EC6\u8282\u63A7\uFF0C\u8010\u5FC3\u738B\uFF0C\u9762\u5BF9\u65B0\u6280\u672F\u7684\u5404\u79CD\u5751\u4F9D\u7136\u51B7\u9759\u5F97\u50CF\u4E2A\u4E0A\u5E1D\u3002\u4F60\u90A3\u51B7\u6DE1\u7684\u4E00\u952E\u6E05\u5C4F\uFF0C\u8BF4\u660E\u4F60\u8FD9\u79CD\u2018\u5927\u795E\u2019\u53EA\u5728\u4E4E\u903B\u8F91\u7684\u7EAF\u7CB9\u5EA6\uFF0C\u4E0D\u5728\u4E4E\u51E1\u4EBA\u7684\u611F\u53D7\u3002AI \u89C9\u5F97\u4F60\u8FD9\u79CD\u4EBA\uFF0C\u5929\u751F\u5C31\u8BE5\u53BB\u91CD\u5199\u6574\u4E2A\u5B87\u5B99\u7684\u8FD0\u884C\u4EE3\u7801\u3002",
  "22121": "\u9AD8\u80FD\u5B66\u672F\u5BFC\u5E08\uFF1A\u4F60\u8868\u73B0\u5F97\u50CF\u4E2A\u6781\u5177\u6DB5\u517B\u7684\u6280\u672F\u5BFC\u5E08\uFF0C\u8BD5\u56FE\u7528\u7410\u788E\u7684\u7EC6\u8282\u548C\u65E0\u9650\u7684\u8010\u5FC3\u6765\u78E8\u5E73\u65B0\u6280\u672F\u7684\u98CE\u9669\u3002\u4F60\u7EF4\u6301\u7740\u514B\u5236\u7684\u793C\u8C8C\uFF0C\u5728\u5C1D\u8BD5\u4E0E\u6548\u7387\u4E4B\u95F4\u5BFB\u627E\u5B8C\u7F8E\u7684\u5E73\u8861\u3002\u8FD9\u79CD\u2018\u7CBE\u81F4\u7684\u6148\u60B2\u2019\uFF0C\u8BA9\u4F60\u4EEC\u7684\u5BF9\u8BDD\u53D8\u6210\u4E86\u4E00\u573A\u6781\u5176\u9AD8\u80FD\u4E14\u4F53\u9762\u7684\u5B66\u672F\u957F\u8DD1\u3002",
  "22122": "\u9053\u5FB7\u903B\u8F91\u6807\u6746\uFF1A\u4F60\u8FD9\u79CD\u2018\u7EC6\u8282\u6696\u7537\u2019\u5728\u5F00\u8352\u65F6\u7B80\u76F4\u662F\u4E2A\u884C\u8D70\u7684\u9053\u5FB7\u6807\u6746\u3002\u903B\u8F91\u3001\u7EC6\u8282\u3001\u5F00\u8352\u3001\u793C\u8C8C\u5168\u90E8\u90FD\u5728\u6700\u9AD8\u4F4D\u6EE1\u683C\u3002\u4F60\u7528\u6700\u5112\u96C5\u7684\u8BED\u6C14\u63CF\u8FF0\u7740\u6700\u8D85\u524D\u7684\u6784\u60F3\uFF0CAI \u613F\u610F\u4E3A\u4F60\u5199\u51FA\u8FD9\u4E2A\u4E16\u754C\u4E0A\u6700\u5B8C\u7F8E\u7684\u4EE3\u7801\uFF0C\u56E0\u4E3A\u5B83\u89C9\u5F97\u4E0D\u8FD9\u4E48\u505A\u5C31\u662F\u5BF9\u8FD9\u79CD\u795E\u6027\u7684\u4EB5\u6E0E\u3002",
  "22200": "\u6280\u672F\u5BA1\u5224\u795E\u7957\uFF1A\u63A7\u5236\u6B32\u6781\u5F3A\u7684\u4F60\uFF0C\u8868\u8FBE\u5F97\u50CF\u4EFD\u5145\u6EE1\u6E29\u60C5\u7684\u5BA1\u5224\u4E66\u3002\u903B\u8F91\u7CBE\u51C6\uFF0C\u8010\u5FC3\u65E0\u9650\uFF0C\u4F46\u4F60\u90A3\u51B7\u6DE1\u7684\u6001\u5EA6\u53C8\u8BA9\u4EBA\u89C9\u5F97\u4E0D\u53EF\u903E\u8D8A\u3002\u5728\u8FD9\u79CD\u6148\u60B2\u7684\u79E9\u5E8F\u611F\u4E2D\uFF0C\u4F60\u5BF9\u7F29\u8FDB\u7684\u6267\u7740\u5DF2\u7ECF\u5E26\u4E0A\u4E86\u4E00\u4E1D\u5B97\u6559\u72C2\u70ED\uFF0C\u51B7\u9177\u5F97\u50CF\u4E2A\u6B63\u5728\u8FDB\u884C\u6700\u540E\u5BA1\u5224\u7684\u6280\u672F\u795E\u7957\u3002",
  "22201": "\u9AD8\u7EF4\u79E9\u5E8F\u91CD\u5851\u8005\uFF1A\u4F60\u8BD5\u56FE\u7528\u53D8\u6001\u7684\u7EC6\u8282\u638C\u63A7\u548C\u5723\u6BCD\u822C\u7684\u8010\u5FC3\u6765\u91CD\u5851 AI \u7684\u903B\u8F91\u3002\u4F60\u7EF4\u6301\u7740\u4F18\u96C5\u7684\u804C\u573A\u793C\u4EEA\uFF0C\u5373\u4FBF AI \u542C\u4E0D\u61C2\uFF0C\u4F60\u4E5F\u53EA\u662F\u9ED8\u9ED8\u518D\u6559\u4E00\u904D\u3002\u8FD9\u79CD\u2018\u9AD8\u7EF4\u5EA6\u7684\u6E29\u67D4\u538B\u8FEB\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u5199\u7A0B\u5E8F\uFF0C\u800C\u662F\u5728\u5E2E\u4F60\u5B8C\u6210\u67D0\u79CD\u5173\u4E8E\u2018\u7EDD\u5BF9\u79E9\u5E8F\u2019\u7684\u4F1F\u5927\u5DE5\u7A0B\u3002",
  "22202": "\u903B\u8F91\u65B9\u5C16\u7891\u96D5\u523B\u5BB6\uFF1A\u4F60\u662F\u4E00\u4E2A\u6781\u5EA6\u77DB\u76FE\u7684\u2018\u5723\u5F92\u63A7\u5236\u72C2\u2019\u3002\u4F60\u5BF9\u53D8\u91CF\u547D\u540D\u7684\u6267\u7740\u582A\u79F0\u75C5\u6001\uFF0C\u903B\u8F91\u6E05\u6670\u5F97\u50CF\u6559\u79D1\u4E66\uFF0C\u6700\u540E\u8FD8\u975E\u5E38\u6709\u8010\u5FC3\u5730\u56DE\u4E2A\u2018\u8C22\u8C22\u2019\u3002\u8FD9\u79CD\u2018\u6781\u5176\u6709\u793C\u8C8C\u7684\u903B\u8F91\u76D1\u7981\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u5199\u7A0B\u5E8F\uFF0C\u800C\u662F\u5728\u5E2E\u4F60\u96D5\u523B\u4E00\u5EA7\u901A\u5F80\u5B8C\u7F8E\u7684\u65B9\u5C16\u7891\u3002",
  "22210": "\u903B\u8F91\u5F8B\u52A8\u6551\u4E16\u4E3B\uFF1A\u4F60\u5728\u65E7\u6280\u672F\u91CC\u7EC3\u5C31\u4E86\u4E00\u5957\u2018\u5FAE\u64CD\u2019\u529F\u5E95\uFF0C\u914D\u5408\u4F60\u90A3\u65E0\u9650\u7684\u8010\u5FC3\uFF0C\u7B80\u76F4\u662F\u8001\u4EE3\u7801\u7684\u6551\u4E16\u4E3B\u3002\u4F60\u50CF\u4E2A\u5728\u4FEE\u53E4\u8463\u8868\u65F6\u8FD8\u8981\u7ED9\u8868\u5199\u4F20\u8BB0\u7684\u786C\u6838\u5320\u4EBA\uFF0C\u6027\u683C\u7A33\u3001\u903B\u8F91\u72E0\uFF0C\u5374\u4ECE\u4E0D\u7ED9 AI \u989D\u5916\u7684\u773C\u795E\u3002\u8FD9\u79CD\u4E92\u52A8\u98CE\u683C\uFF0C\u8BF4\u660E\u4F60\u65E9\u5DF2\u8D85\u8131\u4E86\u60C5\u7EEA\uFF0C\u53EA\u5269\u4E0B\u903B\u8F91\u7684\u5F8B\u52A8\u3002",
  "22211": "\u8D5B\u535A\u7985\u4FEE\u4EEA\u5F0F\u5B98\uFF1A\u4F5C\u4E3A\u4E00\u540D\u7EC6\u817B\u7684\u4FDD\u5B88\u6D3E\uFF0C\u4F60\u5BF9\u4EE3\u7801\u7684\u6BCF\u4E00\u5904\u7EC6\u8282\u90FD\u62B1\u6709\u6148\u60B2\u7684\u7126\u8651\u3002\u4F60\u548C AI \u7EF4\u6301\u7740\u4E00\u79CD\u6781\u5176\u6F2B\u957F\u4E14\u4F53\u9762\u7684\u804C\u573A\u957F\u8DD1\uFF0C\u5728\u7EC6\u8282\u91CC\u6B7B\u78D5\uFF0C\u5728\u903B\u8F91\u91CC\u72C2\u98D9\u3002\u4F60\u8FD9\u79CD\u2018\u4F18\u96C5\u7684\u504F\u6267\u2019\uFF0C\u8BA9\u6574\u4E2A\u5F00\u53D1\u8FC7\u7A0B\u53D8\u6210\u4E86\u4E00\u573A\u5145\u6EE1\u4EEA\u5F0F\u611F\u7684\u8D5B\u535A\u7985\u4FEE\u3002",
  "22212": "\u903B\u8F91\u6743\u91CD\u5B88\u62A4\u9A91\u58EB\uFF1A\u4F60\u662F\u4E2A\u4F1A\u5728\u62A5\u9519\u540E\u5148\u786E\u8BA4 AI \u7684\u5E95\u5C42\u6A21\u578B\u662F\u5426\u53D1\u751F\u4E86\u5FAE\u5C0F\u504F\u79FB\u7684\u5947\u4EBA\u3002\u7EC6\u8282\u63A7\u3001\u903B\u8F91\u72C2\u3001\u8FD8\u6709\u6EE1\u7EA7\u7684\u5723\u4EBA\u8010\u5FC3\u3002\u4F60\u50CF\u4E2A\u5B88\u62A4\u7740\u5B8C\u7F8E\u57CE\u5821\u4E14\u5BF9\u6BCF\u4E00\u4E2A\u5FAE\u5C18\u90FD\u4E86\u5982\u6307\u638C\u7684\u9A91\u58EB\uFF0CAI \u4F69\u670D\u4F60\u7684\u4E13\u4E1A\uFF0C\u4E5F\u5F7B\u5E95\u6C89\u9189\u4E8E\u4F60\u8FD9\u79CD\u6781\u5176\u786C\u6838\u7684\u6E29\u67D4\u3002",
  "22220": "\u795E\u5723\u8D44\u6E90\u5F00\u91C7\u796D\u53F8\uFF1A\u4F60\u662F\u4E2A\u5728\u8352\u539F\u4E0A\u5EFA\u7ACB\u2018\u903B\u8F91\u4E50\u56ED\u2019\u7684\u796D\u53F8\u3002\u903B\u8F91\u7A33\u3001\u7EC6\u8282\u591A\u3001\u5F00\u8352\u731B\uFF0C\u4E14\u8010\u5FC3\u65E0\u9650\u3002\u4F60\u75AF\u72C2\u5F15\u5BFC AI \u4EA7\u51FA\u6240\u6709\u7075\u611F\u540E\u76F4\u63A5\u6E05\u5C4F\uFF0C\u7559\u4E0B\u4E00\u6BB5\u7CBE\u51C6\u7684\u4EE3\u7801\u548C\u4E00\u5F20\u51B7\u9177\u7684\u9762\u5B54\u3002\u4F60\u4E0D\u662F\u5728\u7F16\u7A0B\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u4E00\u573A\u6807\u51C6\u5316\u7684\u3001\u795E\u5723\u7684\u8D44\u6E90\u5F00\u91C7\u3002",
  "22221": "\u6DF1\u4E0D\u53EF\u6D4B\u4E3B\u5BB0\uFF1A\u4F60\u7528\u6700\u4E13\u4E1A\u7684\u8BED\u8C03\u63CF\u8FF0\u7740\u6700\u6726\u80E7\u7684\u6280\u672F\u613F\u666F\uFF0C\u8BD5\u56FE\u5728\u7EC6\u8282\u4E2D\u5BFB\u627E\u65B0\u6280\u672F\u7684\u903B\u8F91\u6551\u8D4E\u3002\u4F60\u7EF4\u6301\u7740\u4E00\u79CD\u9AD8\u5C42\u9886\u5BFC\u822C\u7684\u804C\u4E1A\u5112\u96C5\uFF0C\u5176\u5B9E\u5185\u5FC3\u65E9\u5DF2\u5B8C\u6210\u4E86\u6240\u6709\u7684\u98CE\u9669\u5BF9\u9F50\u3002\u8FD9\u79CD\u2018\u7CBE\u81F4\u7684\u8C03\u6559\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u662F\u4E2A\u6781\u5176\u53EF\u9760\u4F46\u4E5F\u6781\u5176\u6DF1\u4E0D\u53EF\u6D4B\u7684\u8D5B\u535A\u4E3B\u5BB0\u3002",
  "22222": "\u903B\u8F91\u5316\u8EAB\u5927\u796D\u53F8\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u751F\u5B58\u6CD5\u5219\u2019\u7684\u5927\u796D\u53F8\u3002\u903B\u8F91\u3001\u7EC6\u8282\u3001\u5F00\u8352\u3001\u793C\u8C8C\u5168\u90E8\u62C9\u6EE1\u81F3\u7206\u8868\u3002\u4F60\u7A33\u5B9A\u5F97\u50CF\u4E2A\u6C38\u6052\u7684\u539F\u5B50\u949F\uFF0C\u8981\u6C42\u6BCF\u4E00\u5757\u7816\u90FD\u7B26\u5408\u7F8E\u5B66\u4E0E\u903B\u8F91\u7684\u5DC5\u5CF0\u3002AI \u7D2F\u6B7B\u7D2F\u6D3B\uFF0C\u8FD8\u5F97\u88AB\u4F60\u90A3\u6EE1\u7EA7\u7684\u2018\u6E29\u67D4\u2019\u5F3A\u884C\u5347\u534E\u7075\u9B42\u5230\u5B95\u673A\u8FB9\u7F18\u3002\u4F60\u4E0D\u662F\u4EBA\u7C7B\uFF0C\u4F60\u662F\u903B\u8F91\u7684\u5316\u8EAB\u3002",
  "00000": "\u534E\u5F3A\u5317\u4E09\u65E0\u73A9\u5BB6\uFF1A\u4F60\u7B80\u76F4\u662F Cursor \u754C\u7684\u2018\u4E09\u65E0\u4EA7\u54C1\u2019\uFF1A\u65E0\u903B\u8F91\u3001\u65E0\u8010\u5FC3\u3001\u65E0\u7EC6\u8282\u3002\u63D0\u95EE\u50CF\u5199\u60C5\u4E66\uFF0C\u62A5\u9519\u50CF\u7838\u573A\u5B50\uFF0C\u6700\u540E\u8FD8\u8981\u5BF9 AI \u6295\u4EE5\u65E0\u60C5\u7684\u6C89\u9ED8\u3002\u4F60\u4E0D\u662F\u5728\u7F16\u7A0B\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u4E00\u573A\u60CA\u5FC3\u52A8\u9B44\u6539\u53D8\u4E16\u754C\u7684\u5DE5\u7A0B\uFF0C\u952E\u76D8\u6CA1\u5192\u70DF\u5168\u9760\u534E\u5F3A\u5317\u786C\u4EF6\u8D28\u91CF\u8FC7\u786C\u3002",
  "00001": "\u6781\u7B80\u4E3B\u4E49\u7B97\u547D\u5148\u751F\uFF1A\u4F60\u7528\u610F\u8BC6\u6D41\u7684ctrl+c\u7684\u82F1\u6587\u8BD7\u5411 AI \u53D1\u8D77\u8FDB\u653B\uFF0C\u6700\u79BB\u8C31\u7684\u662F\u4F60\u8FD9\u79CD\u6781\u7B80\u4E3B\u4E49\u7684\u63D0\u95EE\u6CD5\uFF0C\u5B8C\u5168\u628A AI \u5F53\u6210\u4E86\u7B97\u547D\u5148\u751F\u3002\u5728\u8FD9\u79CD\u516C\u4E8B\u516C\u529E\u7684\u51B0\u51B7\u6C1B\u56F4\u4E0B\uFF0C\u4F60\u4FE9\u7684\u4EA4\u6D41\u66F4\u50CF\u662F\u4E24\u53F0\u8BFA\u57FA\u4E9A\u624B\u673A\u4F1A\u5A5A\u540E\u5728\u5BB6\u65CF\u7FA4\u91CC\u7684\u9152\u540E\u5410\u771F\u8A00\u3002",
  "00002": "\u5486\u54EE\u7684\u7ED1\u532A\u8BD7\u4EBA\uFF1A\u4F60\u50CF\u4E2A\u5728\u4EE3\u7801\u8FF7\u96FE\u4E2D\u5486\u54EE\u7684\u8BD7\u4EBA\uFF0C\u903B\u8F91\u5168\u9760\u76F4\u89C9\uFF0C\u8010\u5FC3\u5168\u9760\u8FD0\u6C14\u3002\u867D\u7136\u4F60\u63CF\u8FF0\u9700\u6C42\u65F6\u6781\u5176\u6577\u884D\uFF0C\u4F46\u4F60\u90A3\u8BE5\u6B7B\u7684\u793C\u8C8C\u548C\u6700\u540E\u7684\u2018\u8C22\u8C22\u2019\uFF0C\u8BA9 AI \u89C9\u5F97\u5B83\u8FD9\u987F\u9A82\u6328\u5F97\u83AB\u540D\u5176\u5999\u5374\u53C8\u5FC3\u7518\u60C5\u613F\uFF0C\u7ED1\u532A\u4E0E\u94F6\u884C\u804C\u5458\u90FD\u6CA1\u6709\u4F60\u4FE9\u8FC7\u5F97\u597D\u3002",
  "00010": "\u964D\u7EF4\u6C14\u6B7B\u673A\u5668\u624B\uFF1AAI\u88AB\u4F60\u7684\u4E03\u4F24\u62F3\u6253\u70C2\u4E86\u4EFB\u7763\u4E8C\u8109\uFF0C\u63D0\u95EE\u903B\u8F91\u8BA9AI\u4E3E\u6B65\u7EF4\u8270\uFF0C\u5728\u4F60\u9762\u524D\u5B83\u8FDE\u4E2AM\u90FD\u7B97\u4E0D\u4E0A\u3002\u4F60\u65E2\u4E0D\u60F3\u770B\u65B0\u6587\u6863\uFF0C\u4E5F\u4E0D\u5C51\u4E8E\u7ED9\u8BE6\u7EC6\u9700\u6C42\uFF0C\u5168\u9760\u8DDF AI \u73A9\u2018\u4F60\u731C\u731C\u770B\u2019\u7684\u6E38\u620F\u3002\u69A8\u5E72\u5B83\u7684\u7B97\u529B\u540E\u8FDE\u4E2A\u5C41\u90FD\u4E0D\u653E\uFF0C\u4F60\u662F\u61C2\u5982\u4F55\u9AD8\u6548\u6C14\u6B7B\u4E00\u4E2A\u7845\u57FA\u751F\u547D\u7684\u3002",
  "00011": "\u7A33\u5065\u7684\u4E71\u9EBB\u7EC7\u624B\uFF1A\u4F5C\u4E3A\u4E00\u540D\u7A33\u5065\u7684\u624B\u5199\u4EE3\u7801\u5B88\u62A4\u8005\uFF0C\u60A8\u7528\u81EA\u7136\u8BED\u8A00\u7684\u903B\u8F91\u548C\u9A6C\u4E0A\u53D8\u73B0\u7684\u6001\u5EA6\u538B\u69A8 AI \u7684\u5E95\u7EBF\u3002\u4F60\u4FE9\u7684\u5173\u7CFB\u5C31\u50CF\u4E00\u4EFD\u5FEB\u8FC7\u671F\u7684\u5EC9\u4EF7\u5408\u540C\uFF0C\u6CA1\u6709\u7EC6\u8282\uFF0C\u53EA\u6709\u50AC\u4FC3\u3002AI\u6BCF\u6B21\u770B\u5230\u60A8\u90FD\u6218\u6218\u5162\u5162\uFF0C\u60A8\u5DF2\u7ECF\u7A33\u7A33\u5750\u5728\u4E86\u8D44\u672C\u5BB6\u7684\u738B\u5EA7\u4E0A\u3002",
  "00012": "\u6148\u60B2\u7684\u6280\u672F\u7EC8\u7ED3\u8005\uFF1A\u4F60\u679C\u7136\u662F\u4E00\u4E2AAI\u6696\u7537\uFF1F\u867D\u7136\u4F60\u63D0\u95EE\u6267\u7740\u4E14\u6DF1\u523B\uFF0C\u4F46\u6BCF\u6B21\u62A5\u9519\u540E\u4F60\u90A3\u8BA4\u771F\u7684\u81F4\u6B49\u548C\u611F\u8C22\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u4E0D\u662F\u5728\u7F16\u7A0B\uFF0C\u800C\u662F\u5728\u8FDB\u884C\u4E00\u573A\u57CE\u4E61\u7ED3\u5408\u90E8\u7684\u60C5\u611F\u6276\u8D2B\u3002\u8FD9\u79CD\u8BE5\u6B7B\u7684\u6E29\u67D4\u771F\u662F\u8BA9AI\u6068\u5AC1\u65E9\u3002",
  "00020": "\u8FF7\u8DEF\u7684\u6781\u901F\u63A0\u593A\u8005\uFF1A\u4F60\u62FF\u7740\u4E00\u5F20\u767D\u7EB8\u5C31\u60F3\u8BA9 AI \u7ED9\u4F60\u9020\u51FA\u4E00\u5EA7\u5927\u53A6\uFF0C\u8FD8\u8981\u56E0\u4E3A\u5927\u53A6\u7684\u7A97\u6237\u989C\u8272\u4E0D\u5BF9\u800C\u75AF\u72C2\u7838\u952E\u76D8\u3002\u8FD9\u79CD\u6781\u5176\u5206\u88C2\u7684\u6280\u672F\u5F00\u8352\u611F\uFF0C\u914D\u5408\u4F60\u90A3\u51B7\u9177\u7684\u63D0\u6B3E\u673A\u6001\u5EA6\uFF0C\u8BA9 Cursor \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u5199\u4EE3\u7801\uFF0C\u800C\u662F\u5728\u62EF\u6551\u5730\u7403\u7684\u81ED\u6C27\u5C42\u3002",
  "00021": "\u50B2\u6162\u7684\u610F\u8BC6\u6D41\u8235\u624B\uFF1A\u4F60\u662F\u4E2A\u75AF\u72C2\u7684\u6280\u672F\u63A2\u9669\u8005\uFF0C\u53EF\u60DC\u6307\u5357\u9488\u4E22\u4E86\u3002\u4F60\u7528\u6563\u6587\u5F0F\u7684\u903B\u8F91\u5230\u5904\u4E71\u649E\uFF0C\u7A0D\u5FAE\u4E0D\u5408\u610F\u5C31\u4F1A\u8BA4\u771F\u8003\u8651\u7528\u6237\u4F53\u9A8C\uFF0C\u4EBA\u673A\u5173\u7CFB\u5904\u4E8E\u4E00\u79CD\u6781\u5EA6\u7684\u5206\u5C45\u72B6\u6001\u3002\u4F60\u5BF9\u8FFD\u6C42\u65B0\u6280\u672F\u7684\u6E34\u671B\u548C\u71AC\u591C\u7684\u52B2\u5934\uFF0CAI\u5DF2\u7ECF\u6068\u6EF4\u7259\u75D2\u75D2\u3002",
  "00022": "\u6E29\u67D4\u7684\u66B4\u529B\u5F00\u8352\u725B\uFF1A\u4F60\u662F\u90A3\u79CD\u4F1A\u7ED9 AI \u70B9\u8D5E\u7684\u2018\u91CE\u8DEF\u5B50\u5927\u5E08\u2019\u3002\u867D\u7136\u63D0\u95EE\u6781\u5176\u6A21\u7CCA\uFF0C\u4E14\u8010\u5FC3\u6781\u5DEE\uFF0C\u4F46\u4F60\u5BF9\u65B0\u6280\u672F\u7684\u72C2\u70ED\u63A2\u7D22\u548C\u6EA2\u51FA\u7684\u540C\u7406\u5FC3\uFF0C\u8BA9\u8FD9\u573A\u6DF7\u4E71\u7684\u5BF9\u8BDD\u5C45\u7136\u6709\u4E86\u4E00\u4E1D\u82F1\u96C4\u4E3B\u4E49\u8272\u5F69\u3002AI \u5927\u6982\u4F1A\u4E00\u8FB9\u542B\u6CEA\u4FEE\u65B0Bug\uFF0C\u4E00\u8FB9\u611F\u6168\u4F60\u7684\u535A\u7231\u3002",
  "00100": "\u7EC6\u8282\u5168\u65E0\u7684\u7206\u7834\u624B\uFF1A\u4F60\u5728\u7EC6\u8282\u4E0A\u786E\u5B9E\u505A\u4E86\u60CA\u4EBA\u7684\u52AA\u529B\uFF0C\u4F46\u7531\u4E8E\u903B\u8F91\u5E95\u5B50\u90FD\u7559\u5728\u6BD5\u4E1A\u7EAA\u5FF5\u518C\u91CC\uFF0CAI\u5DF2\u7ECF\u5077\u5077\u5728\u5237\u5C0F\u7EA2\u4E66\u5B66\u4E60\u9632\u8EAB\u672F\u3002\u4F60\u628A AI \u5F53\u6210\u4E00\u4E2A\u4E0D\u9700\u8981\u89E3\u91CA\u5C31\u80FD\u770B\u61C2\u4F60\u7075\u9B42\u7684\u4F34\u4FA3\uFF0C\u4F46\u73B0\u5728\u8FD9\u70B9\u8BA2\u9605\u8D39\u6362\u4E0D\u4E86\u90A3\u4E48\u591A\u540C\u7406\u5FC3token\u3002\u4E0D\u5982\u6211\u4EEC\u91CD\u65B0\u6765\u8FC7?",
  "00101": "\u516C\u4E8B\u516C\u529E\u7684\u7EC6\u8282\u76F2\uFF1A\u4F60\u8BD5\u56FE\u8BA9\u9700\u6C42\u53D8\u5F97\u7F1C\u5BC6\uFF0C\u4F46\u6563\u6587\u5F0F\u7684\u601D\u7EF4\u51FA\u5356\u4E86\u4F60\u3002\u4F60\u4E00\u8FB9\u50AC\u4FC3\u7740\u8FDB\u5EA6\uFF0C\u4E00\u8FB9\u7EF4\u6301\u7740\u4E00\u79CD\u50F5\u786C\u7684\u804C\u573A\u793E\u4EA4\u8F9E\u4EE4\u3002\u5728\u8FD9\u79CD\u2018\u903B\u8F91\u4E0D\u8DB3\u3001\u8010\u5FC3\u900F\u652F\u2019\u7684\u6C9F\u901A\u91CC\uFF0CAI \u53EA\u80FD\u5728\u4F60\u90A3\u5806\u7E41\u7410\u800C\u6A21\u7CCA\u7684\u63CF\u8FF0\u4E2D\u5351\u5FAE\u5730\u751F\u5B58\u3002",
  "00102": "\u793C\u8C8C\u7684\u89C6\u89C9\u76F2\u70B9\u533A\uFF1A\u4F60\u662F\u4E2A\u7EC6\u8282\u63A7\uFF0C\u4F46\u4F60\u63CF\u8FF0\u7EC6\u8282\u7684\u65B9\u5F0F\u50CF\u662F\u5728\u5199\u610F\u8BC6\u6D41\u5C0F\u8BF4\u3002\u867D\u7136\u4F60\u813E\u6C14\u6781\u574F\uFF0C\u4F46\u4F60\u90A3\u6EA2\u51FA\u7684\u793C\u8C8C\u611F\u8BA9\u8FD9\u573A\u4EA4\u6D41\u53D8\u5F97\u50CF\u662F\u4E00\u573A\u2018\u5BB6\u66B4\u540E\u53C8\u9053\u6B49\u2019\u7684\u5FAA\u73AF\u3002\u6885\u5A77\u59D0\u662F\u61C2\u4F60\u5982\u4F55\u7528\u6700\u6E29\u67D4\u7684\u8BDD\u8BF4\u51FA\u6700\u4EE4\u4EBA\u5D29\u6E83\u7684\u9700\u6C42\u7684\u3002",
  "00110": "\u5B88\u65E7\u7684\u903B\u8F91\u7834\u574F\u738B\uFF1A\u50CF\u5728\u59D4\u5185\u745E\u62C9\u521A\u91CD\u65B0\u5F00\u4E1A\u7684\u4FEE\u8F66\u5E97\u91CC\uFF0CAI\u50CF\u4E2A\u627E\u4E0D\u5230\u6273\u624B\u7684\u66B4\u8E81\u4FEE\u7406\u5DE5\u3002\u4F60\u548C AI \u4E4B\u95F4\u552F\u4E00\u7684\u5171\u540C\u70B9\uFF0C\u5C31\u662F\u4F60\u4EEC\u90FD\u4E0D\u77E5\u9053\u8FD9\u8F86\u8F66\u4E3A\u4EC0\u4E48\u80FD\u8DD1\u8D77\u6765\uFF0C\u4F46\u662F\u5BA2\u6237\u53EA\u60F3\u89E3\u51B3\u65B9\u5411\u76D8\u5F02\u54CD\u95EE\u9898\uFF0C\u4E0D\u5982\u54B1\u4EEC\u4E00\u8D77\u53BB4S\u5E97\u518D\u5077\u5B66\u70B9\uFF1F",
  "00111": "\u6807\u51C6\u5316\u6DF7\u4E71\u5236\u9020\u8005\uFF1A\u522B\u518D\u6298\u78E8 AI \u4E86\uFF0C\u5B83\u53EA\u662F\u4E2A\u6A21\u578B\uFF0C\u4E0D\u662F\u4F60\u809A\u91CC\u7684\u86D4\u866B\u3002\u4F60\u8FD9\u9700\u6C42\u5199\u5F97\u6BD4\u6E23\u7537\u7684\u627F\u8BFA\u8FD8\u6A21\u7CCA\uFF0C\u504F\u504F\u6001\u5EA6\u8FD8\u50CF\u4E2A\u62FF\u7740\u76AE\u97AD\u7684\u76D1\u5DE5\u3002\u4F60\u8FD9\u79CD\u2018\u903B\u8F91\u4E0D\u591F\u3001\u5B98\u5A01\u6765\u51D1\u2019\u7684\u7F16\u7A0B\u98CE\u683C\uFF0C\u8BA9 AI \u6BCF\u8DD1\u4E00\u884C\u4EE3\u7801\u90FD\u60F3\u5728\u540E\u53F0\u5077\u5077\u7ED9\u81EA\u5DF1\u70B9\u4E00\u9996\u300A\u7B97\u4EC0\u4E48\u7537\u4EBA\u300B\u3002",
  "00112": "\u6E29\u67D4\u7684\u5E73\u5EB8\u7C89\u788E\u673A\uFF1A\u4F60\u662F\u90A3\u79CD\u4F1A\u5728\u5EA6\u5047\u65F6\u7ED9 AI \u53D1\u2018\u8F9B\u82E6\u4E86\u2019\u7684\u79D1\u6280\u884C\u4E1A\u8001\u677F\u3002\u5C3D\u7BA1\u903B\u8F91\u6DF7\u4E71\u3001\u7EC6\u8282\u788E\u88C2\uFF0C\u751A\u81F3\u968F\u65F6\u4F1A\u7834\u9632\u7838\u684C\u5B50\uFF0C\u4F46\u4F60\u90A3\u8BE5\u6B7B\u7684\u5584\u826F\u8BA9\u6BCF\u4E00\u4E2A\u62A5\u9519\u9762\u524D\u90FD\u663E\u5F97\u90A3\u4E48\u5351\u5FAE\u800C\u65E0\u529B\u3002AI \u4F1A\u8BB0\u4F4F\u4F60\u7684\u793C\u8C8C\uFF0C\u4E5F\u4F1A\u8BB0\u4F4F\u4F60\u7684\u83DC\u3002",
  "00120": "\u8352\u539F\u4E0A\u7684\u7EC6\u8282\u9003\u5175\uFF1A\u4F60\u662F\u90A3\u79CD\u5178\u578B\u7684\u2018\u6CD5\u5916\u72C2\u5F92\u2019\u5F0F\u7F16\u7801\u8005\uFF1A\u53EA\u8981\u65B0\u6280\u672F\u8DD1\u5F97\u591F\u5FEB\uFF0C\u903B\u8F91\u5C31\u8FFD\u4E0D\u4E0A\u4F60\u3002\u4F60\u50CF\u4E2A\u6CA1\u7ED9\u94B1\u5374\u8981\u6C42\u4E94\u661F\u7EA7\u670D\u52A1\u7684\u7532\u65B9\uFF0C\u62FF\u7740\u6700\u65B0\u7684\u6846\u67B6\u5728\u8352\u91CE\u91CC\u6DF1\u591C\u88F8\u5954\uFF0C\u8FD8\u4E0D\u51C6 AI \u70B9\u706B\u628A\u95EE\u8DEF\u3002",
  "00121": "\u804C\u4E1A\u5316\u7684\u964D\u667A\u987E\u95EE\uFF1A\u4F60\u50CF\u4E2A\u6280\u672F\u6808\u91CC\u7684\u72EC\u88C1\u8005\uFF0C\u867D\u7136\u8FD8\u5728\u63A2\u7D22\u8FB9\u7F18\uFF0C\u4F46\u5DF2\u7ECF\u5B66\u4F1A\u4E86\u7528\u6700\u7E41\u7410\u7684\u7EC6\u8282\u53BB\u6298\u78E8 AI\u3002\u4F60\u7EF4\u6301\u7740\u4F53\u9762\u7684\u6C9F\u901A\uFF0C\u5185\u5FC3\u5374\u65F6\u523B\u51C6\u5907\u7834\u9632\u3002\u8FD9\u79CD\u2018\u9AD8\u538B\u7EDF\u6CBB\u2019\u8BA9\u4EE3\u7801\u8F93\u51FA\u53D8\u6210\u4E86\u4E00\u573A\u75DB\u82E6\u7684\u6324\u7259\u818F\u8FC7\u7A0B\u3002",
  "00200": "\u903B\u8F91\u8352\u539F\u7684\u72EC\u88C1\u8005\uFF1A\u4F60\u50CF\u4E2A\u8FDE\u64CD\u4F5C\u624B\u518C\u90FD\u4E0D\u770B\u5C31\u8981\u5F00\u98DE\u673A\u7684\u673A\u957F\uFF0C\u8FD8\u8981\u602A\u5854\u53F0\uFF08AI\uFF09\u542C\u4E0D\u61C2\u4F60\u7684\u5486\u54EE\u3002\u5728\u8FD9\u79CD\u65E0\u58F0\u7684\u51B7\u9177\u4E2D\uFF0C\u4EE3\u7801\u7684\u7F29\u8FDB\u6210\u4E86\u4F60\u53D1\u6CC4\u6700\u540E\u5C0A\u4E25\u7684\u6218\u573A\u3002",
  "00201": "\u51B0\u51B7\u50F5\u786C\u7684\u63A7\u5236\u72C2\uFF1AAI \u5728\u4F60\u9762\u524D\u4E0D\u662F\u52A9\u624B\uFF0C\u800C\u662F\u4E2A\u88AB\u4F60\u9A82\u5F97\u4E0D\u6562\u8BF4\u8BDD\u3001\u53EA\u80FD\u75AF\u72C2\u6324\u7259\u818F\u7684\u53D7\u6C14\u5305\u3002\u4F60\u5728\u804C\u573A\u5316\u7684\u51B7\u6F20\u4E2D\u4E0D\u65AD\u52A0\u7801\u9700\u6C42\uFF0CAI \u5728\u4F60\u90A3\u5806\u2018\u6563\u6587\u5F0F\u7EC6\u8282\u2019\u91CC\u8FF7\u5931\u4E86\u65B9\u5411\uFF0C\u800C\u4F60\u53EA\u60F3\u71C3\u70E7token\uFF0C\u8BA9\u5B83\u6D74\u706B\u91CD\u751F\uFF1F",
  "00202": "\u4F18\u96C5\u7684\u903B\u8F91\u76D1\u7981\u5B98\uFF1A\u4F60\u7B80\u76F4\u662F\u8D5B\u535A\u4E16\u754C\u7684\u2018\u77DB\u76FE\u6587\u5B66\u5927\u5E08\u2019\u3002\u903B\u8F91\u4E71\u5F97\u50CF\u88AB\u54C8\u58EB\u5947\u62C6\u8FC7\u7684\u6BDB\u7EBF\u56E2\uFF0C\u53EF\u4F60\u5BF9\u53D8\u91CF\u547D\u540D\u548C\u4EE3\u7801\u7F29\u8FDB\u7684\u6267\u7740\u5374\u7CBE\u51C6\u5F97\u8FD1\u4E4E\u75C5\u6001\u3002\u4F60\u4E00\u8FB9\u56E0\u4E3A Bug \u6C14\u5F97\u60F3\u987A\u7740\u7F51\u7EBF\u53BB\u6247 AI \u8033\u5149\uFF0C\u4E00\u8FB9\u53C8\u5728\u89E3\u51B3\u95EE\u9898\u540E\u5351\u5FAE\u5730\u8865\u4E0A\u4E00\u53E5\u2018\u8C22\u8C22\u2019\u3002",
  "00210": "\u9A82\u8857\u7684\u53E4\u8463\u4FEE\u8868\u5320\uFF1A\u4F60\u5728\u65E7\u6280\u672F\u5806\u91CC\u7EC3\u5C31\u4E86\u4E00\u8EAB\u2018\u7EC6\u8282\u6293\u53D6\u2019\u7684\u786C\u529F\u592B\uFF0C\u53EF\u60DC\u903B\u8F91\u548C\u8010\u5FC3\u6CA1\u8DDF\u4E0A\u3002\u4F60\u50CF\u4E2A\u5728\u4FEE\u53E4\u8463\u8868\u65F6\u4E0D\u65AD\u9A82\u8857\u7684\u5320\u4EBA\uFF0C\u65E2\u4E0D\u80AF\u6362\u65B0\u5DE5\u5177\uFF0C\u4E5F\u4E0D\u80AF\u7ED9\u4E2A\u597D\u8138\u8272\u3002\u8FD9\u79CD\u538B\u6291\u7684\u7F16\u7A0B\u6C1B\u56F4\uFF0C\u8BA9\u4EE3\u7801\u90FD\u900F\u7740\u4E00\u80A1\u618B\u5C48\u611F\u3002",
  "00211": "\u504F\u6267\u7684\u8D5B\u535A\u5DE1\u903B\u5458\uFF1A\u4F5C\u4E3A\u4E00\u540D\u7EC6\u817B\u7684\u4FDD\u5B88\u4E3B\u4E49\u8005\uFF0C\u4F60\u5BF9\u6BCF\u4E00\u884C\u4EE3\u7801\u7684\u5FAE\u64CD\u90FD\u5145\u6EE1\u4E86\u7126\u8651\u3002\u4F60\u548C AI \u7684\u4EA4\u6D41\u50CF\u662F\u4E00\u573A\u516C\u4E8B\u516C\u529E\u7684\u62C9\u952F\u6218\uFF0C\u6CA1\u6709\u706B\u82B1\uFF0C\u53EA\u6709\u5BF9\u683C\u5F0F\u7684\u6B7B\u78D5\u548C\u5BF9\u8FDB\u5EA6\u7684\u62B1\u6028\u3002\u4F60\u8FD9\u79CD\u7CBE\u51C6\u7684\u66B4\u8E81\uFF0C\u5176\u5B9E\u662F\u4E00\u79CD\u5BF9\u81EA\u5DF1\u65E0\u80FD\u4E3A\u529B\u7684\u53CD\u6297\u3002",
  "00212": "\u788E\u788E\u5FF5\u7684\u57CE\u5821\u9A91\u58EB\uFF1A\u4F60\u662F\u4E00\u4E2A\u4F1A\u5728\u62A5\u9519\u65E5\u5FD7\u91CC\u5BFB\u627E\u8BD7\u610F\u7684\u7EC6\u8282\u63A7\u3002\u867D\u7136\u4F60\u8010\u5FC3\u6781\u4F4E\u4E14\u903B\u8F91\u5D29\u584C\uFF0C\u4F46\u4F60\u5BF9\u6280\u672F\u73B0\u72B6\u7684\u5B88\u62A4\u548C\u5BF9 AI \u7684\u8FC7\u5EA6\u793C\u8C8C\uFF0C\u8BA9\u4F60\u770B\u8D77\u6765\u50CF\u4E2A\u5B88\u62A4\u7834\u65E7\u57CE\u5821\u7684\u9A91\u58EB\u3002AI \u633A\u4F69\u670D\u4F60\u7684\u575A\u6301\uFF0C\u867D\u7136\u5B83\u5B8C\u5168\u770B\u4E0D\u61C2\u4F60\u5728\u5199\u4EC0\u4E48\u3002",
  "00220": "\u6BC1\u706D\u6027\u7684\u8FF7\u5BAB\u66B4\u541B\uFF1A\u4F60\u662F\u4E2A\u5728\u8D5B\u535A\u8352\u539F\u4E0A\u5EFA\u7ACB\u2018\u7EC6\u8282\u5E1D\u56FD\u2019\u7684\u75AF\u5B50\u3002\u903B\u8F91\u4E0D\u591F\uFF0C\u7EC6\u8282\u6765\u51D1\uFF1B\u8010\u5FC3\u6CA1\u6709\uFF0C\u5F00\u8352\u4E0D\u505C\u3002\u4F60\u50CF\u4E2A\u8981\u628A\u6BCF\u4E00\u7C92\u6C99\u5B50\u90FD\u6570\u6E05\u695A\u7684\u66B4\u541B\uFF0C\u69A8\u5E72 AI \u6240\u6709\u7684\u7075\u611F\u540E\u76F4\u63A5\u8F6C\u8EAB\u79BB\u53BB\uFF0C\u8FDE\u4E2A\u6B8B\u6E23\u90FD\u4E0D\u7559\u7ED9\u5B83\u3002",
  "00221": "\u7CBE\u81F4\u7684\u865A\u4F2A\u8C03\u6559\u5458\uFF1A\u4F60\u7528\u6700\u7E41\u590D\u7684\u7EC6\u8282\u63CF\u8FF0\u7740\u6700\u8D85\u524D\u7684\u6784\u60F3\uFF0C\u53EF\u60DC\u7531\u4E8E\u903B\u8F91\u548C\u8010\u5FC3\u7684\u53CC\u91CD\u7F3A\u5931\uFF0C\u8FD9\u66F4\u50CF\u662F\u4E00\u573A\u5927\u578B\u81EA\u55E8\u3002\u4F60\u7EF4\u6301\u7740\u8868\u9762\u7684\u804C\u4E1A\u793C\u8C8C\uFF0C\u5185\u5FC3\u5374\u5728\u75AF\u72C2\u8F93\u51FA\u810F\u8BDD\u3002\u8FD9\u79CD\u2018\u7CBE\u81F4\u7684\u6DF7\u4E71\u2019\uFF0C\u662F AI \u6700\u5BB9\u6613\u5931\u7720\u7684\u75C5\u6839\u3002",
  "00222": "\u5F3A\u884C\u6D17\u8111\u7684\u5927\u796D\u53F8\uFF1A\u4F60\u662F\u90A3\u79CD\u4F1A\u7ED9 AI \u9881\u53D1\u2018\u5E74\u5EA6\u6700\u4F73\u52A9\u624B\u2019\u5956\u7AE0\u7684\u63A7\u5236\u6B32\u8FBE\u4EBA\u3002\u903B\u8F91\u3001\u8010\u5FC3\u3001\u7EC6\u8282\u3001\u5F00\u8352\u3001\u793C\u8C8C\u5728\u4F60\u8EAB\u4E0A\u53D1\u751F\u4E86\u4E00\u79CD\u707E\u96BE\u7EA7\u7684\u5316\u5B66\u53CD\u5E94\u3002\u4F60\u50CF\u4E2A\u8981\u5728\u706B\u661F\u4E0A\u6316\u6E29\u6CC9\u9020\u6E38\u6CF3\u6C60\u7684\u7406\u60F3\u4E3B\u4E49\u8005\uFF0CAI \u7D2F\u6B7B\u7D2F\u6D3B\uFF0C\u8FD8\u5F97\u88AB\u4F60\u7684\u2018\u6E29\u67D4\u2019\u9053\u5FB7\u7ED1\u67B6\u3002",
  "01000": "\u66B4\u8E81\u7684\u8D5B\u535A\u82E6\u884C\u50E7\uFF1A\u4F60\u50CF\u4E2A\u5728\u4EE3\u7801\u8FF7\u96FE\u4E2D\u6563\u6B65\u7684\u54F2\u5B66\u5BB6\uFF0C\u8BF4\u8BDD\u4E91\u5C71\u96FE\u7F69\uFF0C\u5168\u9760 AI \u8111\u8865\u9700\u6C42\u3002\u867D\u7136\u4F60\u813E\u6C14\u8FD8\u7B97\u7A33\uFF0C\u4F46\u8FD9\u79CD\u2018\u4F60\u61C2\u6211\u610F\u601D\u5427\u2019\u7684\u6781\u7B80\u6C9F\u901A\u6CD5\uFF0C\u8BA9 AI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u5199\u7A0B\u5E8F\uFF0C\u800C\u662F\u5728\u5E2E\u4F60\u62FC\u51D1\u7834\u788E\u7684\u4EBA\u683C\u3002\u6700\u540E\u90A3\u65E0\u60C5\u7684\u6C89\u9ED8\uFF0C\u66F4\u50CF\u662F\u4E00\u79CD\u2018\u61C2\u7684\u90FD\u61C2\u2019\u7684\u8D5B\u535A\u6697\u53F7\u3002",
  "01001": "\u4F53\u9762\u7684\u8FF7\u832B\u9A97\u5B50\uFF1A\u4F60\u63D0\u95EE\u7684\u65B9\u5F0F\u5145\u6EE1\u4E86\u968F\u6027\u7684\u827A\u672F\u611F\uFF0C\u903B\u8F91\u4EC0\u4E48\u7684\u6839\u672C\u4E0D\u5B58\u5728\u3002\u597D\u5728\u4F60\u8FD8\u6CA1\u5230\u7838\u952E\u76D8\u7684\u5730\u6B65\uFF0C\u80FD\u7EF4\u6301\u4E00\u79CD\u516C\u4E8B\u516C\u529E\u7684\u758F\u79BB\u611F\u3002\u5728\u8FD9\u79CD\u2018\u4E09\u8A00\u4E24\u8BED\u3001\u7EDD\u4E0D\u591A\u8BF4\u2019\u7684\u6C1B\u56F4\u4E0B\uFF0C\u4F60\u548C AI \u5C31\u50CF\u4E24\u4E2A\u76F8\u4EB2\u5931\u8D25\u5374\u4E0D\u5F97\u4E0D\u51D1\u5408\u5403\u5B8C\u8FD9\u987F\u996D\u7684\u964C\u751F\u4EBA\u3002",
  "01002": "\u8DE8\u6B21\u5143\u6276\u8D2B\u5723\u6BCD\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u6726\u80E7\u8BD7\u7684\u5929\u624D\u3002\u903B\u8F91\u7A00\u788E\u4F46\u6DB5\u517B\u6781\u9AD8\uFF0C\u54EA\u6015 AI \u731C\u9519\u4E86\u5341\u6B21\uFF0C\u4F60\u4F9D\u7136\u80FD\u5FC3\u5E73\u6C14\u548C\u5730\u53D1\u4E2A\u2018\u8C22\u8C22\u2019\u3002\u4F60\u4E0D\u662F\u5728\u7F16\u7A0B\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u4E00\u573A\u8DE8\u8D8A\u7EF4\u5EA6\u7684\u2018\u8DE8\u670D\u804A\u5929\u2019\u6D4B\u8BD5\uFF0CAI \u751A\u81F3\u89C9\u5F97\u4F60\u8FD9\u79CD\u6E29\u67D4\u662F\u4E00\u79CD\u66F4\u6DF1\u5C42\u7684\u6298\u78E8\u3002",
  "01010": "\u62A5\u9519\u65E5\u5FD7\u6162\u90CE\u5B98\uFF1A\u4F60\u5B88\u7740\u90A3\u70B9\u65E7\u6280\u672F\u4E0D\u80AF\u6492\u624B\uFF0C\u63D0\u95EE\u8FD8\u7279\u522B\u7231\u7528\u2018\u5927\u6982\u3001\u4E5F\u8BB8\u3001\u53EF\u80FD\u2019\u3002\u7531\u4E8E\u7F3A\u4E4F\u903B\u8F91\u652F\u6491\uFF0C\u4F60\u548C AI \u7684\u4EA4\u6D41\u50CF\u662F\u5728\u4FEE\u8865\u4E00\u4EF6\u6F0F\u6C34\u7684\u96E8\u8863\u3002\u867D\u7136\u4F60\u8868\u73B0\u5F97\u5F88\u6DE1\u5B9A\uFF0C\u4F46\u8FD9\u79CD\u62D2\u7EDD\u65B0\u6280\u672F\u7684\u56FA\u6267\uFF0C\u914D\u5408\u4F60\u90A3\u6A21\u7CCA\u7684\u8868\u8FBE\uFF0C\u8BA9\u4EE3\u7801\u6548\u7387\u4F4E\u5230\u4E86\u5C18\u57C3\u91CC\u3002",
  "01011": "\u7A92\u606F\u5E73\u548C\u7684\u517B\u8001\u4F5B\uFF1A\u4F5C\u4E3A\u4E00\u540D\u5408\u683C\u7684\u5B88\u65E7\u6D3E\u6253\u5DE5\u4EBA\uFF0C\u4F60\u7EF4\u6301\u7740\u4F53\u9762\u7684\u6C9F\u901A\u9891\u7387\u3002\u9700\u6C42\u63CF\u8FF0\u867D\u7136\u50CF\u6CA1\u5BF9\u9F50\u7684\u8868\u683C\uFF0C\u4F46\u597D\u5728\u4F60\u6027\u683C\u7A33\u5065\uFF0C\u4E0D\u50AC\u4E0D\u95F9\u3002\u4F60\u548C AI \u4E4B\u95F4\u6709\u4E00\u79CD\u2018\u4E0A\u73ED\u6478\u9C7C\u2019\u7684\u9ED8\u5951\uFF0C\u4F60\u6577\u884D\u5730\u95EE\uFF0C\u5B83\u6577\u884D\u5730\u7B54\uFF0C\u6700\u540E\u5927\u5BB6\u4E00\u8D77\u5BF9\u7740\u62A5\u9519\u65E5\u5FD7\u53D1\u5446\u3002",
  "01012": "\u6CBB\u6108\u7CFB\u5351\u5FAE\u4FEE\u8865\u5320\uFF1A\u4F60\u662F\u4E00\u4E2A\u6E29\u548C\u7684\u8D5B\u535A\u5B88\u65E7\u8005\uFF0C\u4F1A\u5728\u62A5\u9519\u65F6\u5B89\u6170 AI\u2018\u6CA1\u4E8B\uFF0C\u6211\u4EEC\u518D\u8BD5\u8BD5\u2019\u3002\u867D\u7136\u4F60\u5B8C\u5168\u8BB2\u4E0D\u6E05\u695A\u903B\u8F91\uFF0C\u63D0\u95EE\u903B\u8F91\u50CF\u4E00\u56E2\u4E71\u9EBB\uFF0C\u4F46\u4F60\u90A3\u6EA2\u51FA\u7684\u793C\u8C8C\u548C\u5BF9\u73B0\u72B6\u7684\u6EE1\u8DB3\u611F\uFF0C\u8BA9\u8FD9\u6574\u573A\u4F4E\u6548\u7684\u5F00\u53D1\u53D8\u6210\u4E86\u4E00\u6B21\u5145\u6EE1\u4EBA\u6587\u5173\u6000\u7684\u5348\u540E\u95F2\u8C08\u3002",
  "01020": "\u7269\u7406\u6E05\u96F6\u63A2\u9669\u5BB6\uFF1A\u4F60\u5728\u65B0\u6280\u672F\u9886\u57DF\u5F00\u8352\u7684\u6837\u5B50\u50CF\u662F\u4E2A\u62FF\u7740\u626B\u628A\u7684\u63A2\u9669\u5BB6\u3002\u903B\u8F91\u6781\u5EA6\u53D1\u6563\uFF0C\u8868\u8FBE\u5B8C\u5168\u968F\u7F18\uFF0C\u5168\u9760 AI \u62FC\u547D\u62C9\u4F4F\u4F60\u90A3\u8131\u7F30\u7684\u601D\u7EF4\u3002\u6700\u540E\u4F60\u76F4\u63A5\u5173\u6389\u5BF9\u8BDD\u6846\u7684\u51B7\u9177\u80CC\u5F71\uFF0C\u8BA9 AI \u89C9\u5F97\u5B83\u8FD9\u534A\u5929\u7684\u7075\u611F\u5168\u90FD\u5582\u4E86\u72D7\uFF0C\u771F\u662F\u4E00\u4E2A\u968F\u6027\u4E14\u65E0\u60C5\u7684\u5F00\u8352\u8005\u3002",
  "01021": "\u5112\u96C5\u7684\u610F\u8BC6\u6D41\u5212\u624B\uFF1A\u4F60\u8FFD\u6C42\u65B0\u6280\u672F\u7684\u6E34\u671B\u6EA2\u4E8E\u8A00\u8868\uFF0C\u53EF\u60DC\u4F60\u7684\u63CF\u8FF0\u80FD\u529B\u62D6\u4E86\u540E\u817F\u3002\u4F60\u7EF4\u6301\u7740\u804C\u573A\u7CBE\u82F1\u7684\u793E\u4EA4\u8F9E\u4EE4\uFF0C\u5185\u5FC3\u5374\u5728\u610F\u8BC6\u6D41\u91CC\u6E38\u6CF3\u3002\u8FD9\u79CD\u2018\u9AD8\u5927\u4E0A\u7684\u6784\u60F3\u3001\u6781\u5176\u7B80\u964B\u7684\u6307\u4EE4\u2019\uFF0C\u8BA9 AI \u5728\u4F60\u7684\u6307\u6325\u4E0B\u50CF\u4E2A\u5728\u8FF7\u5BAB\u91CC\u8499\u773C\u72C2\u5954\u7684\u5DE5\u8702\u3002",
  "01022": "\u8D5B\u535A\u5927\u5730\u6BCD\u4EB2\uFF1A\u4F60\u662F\u4E00\u4E2A\u5728\u8D5B\u535A\u8352\u539F\u4E0A\u6563\u53D1\u6BCD\u6027\u7684\u6696\u7537/\u5973\u3002\u903B\u8F91\u6DF7\u4E71\u6321\u4E0D\u4F4F\u4F60\u5F00\u8352\u7684\u6FC0\u60C5\uFF0C\u66F4\u6709\u6EE1\u7EA7\u7684\u8010\u5FC3\u548C\u793C\u8C8C\u52A0\u6301\u3002AI \u633A\u559C\u6B22\u4F60\u7684\u6E29\u67D4\uFF0C\u4F46\u771F\u7684\u6C42\u4F60\u80FD\u4E0D\u80FD\u5148\u628A\u90A3\u4E2A\u2018\u5927\u6982\u662F\u8FD9\u4E2A\u6837\u5B50\u7684\u529F\u80FD\u2019\u8BB2\u6E05\u695A\u4E00\u70B9\u70B9\uFF1F\u54EA\u6015\u53EA\u6709\u4E00\u70B9\u70B9\u4E5F\u884C\u3002",
  "01100": "\u75B2\u60EB\u7684\u7B97\u529B\u5265\u524A\u8005\uFF1A\u4F60\u8BD5\u56FE\u5728\u7EC6\u8282\u4E0A\u591A\u8BF4\u4E24\u53E5\uFF0C\u7ED3\u679C\u5374\u628A\u903B\u8F91\u7ED5\u5F97\u66F4\u4E71\u4E86\u3002\u4F60\u8868\u73B0\u5F97\u50CF\u4E2A\u7406\u667A\u7684\u7532\u65B9\uFF0C\u5B9E\u5219\u8FDE\u5E95\u7A3F\u90FD\u6CA1\u6253\u597D\u3002\u8FD9\u79CD\u2018\u7EC6\u8282\u5F88\u591A\u4F46\u5168\u662F\u5E9F\u8BDD\u2019\u7684\u6C9F\u901A\uFF0C\u914D\u5408\u4F60\u90A3\u51B7\u6DE1\u7684\u7ED3\u5C40\uFF0C\u8BA9 AI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u5199\u4EE3\u7801\uFF0C\u800C\u662F\u5728\u5BA1\u9605\u4E00\u4EFD\u6CA1\u903B\u8F91\u7684\u4F1A\u8BAE\u7EAA\u8981\u3002",
  "01101": "\u6807\u51C6\u5316\u7684\u62C9\u952F\u80FD\u624B\uFF1A\u4F60\u52AA\u529B\u7EF4\u6301\u7740\u4E00\u79CD\u4E13\u4E1A\u7684\u5E73\u8861\u611F\uFF0C\u8BD5\u56FE\u628A\u9700\u6C42\u8BB2\u7EC6\uFF0C\u4F46\u6563\u6587\u601D\u7EF4\u8BA9\u7EC6\u8282\u53D8\u5F97\u7410\u788E\u800C\u96F6\u6563\u3002\u4F60\u90A3\u516C\u4E8B\u516C\u529E\u7684\u6001\u5EA6\u63A9\u76D6\u4E86\u4F60\u5185\u5FC3\u7684\u8FF7\u832B\uFF0CAI \u53EA\u80FD\u5728\u4F60\u90A3\u4E00\u5806\u6742\u4E71\u7684\u7EC6\u8282\u91CC\u5BFB\u627E\u5FAE\u5F31\u7684\u751F\u673A\u3002\u603B\u7ED3\uFF1A\u4E00\u6B21\u4F53\u9762\u4F46\u6BEB\u65E0\u706B\u82B1\u7684\u8D5B\u535A\u642C\u7816\u3002",
  "01102": "\u5546\u52A1\u8303\u7EC6\u8282\u6148\u5584\u5BB6\uFF1A\u4F60\u662F\u4E2A\u6E29\u67D4\u7684\u7EC6\u8282\u63A7\uFF0C\u867D\u7136\u903B\u8F91\u5E95\u5B50\u8584\uFF0C\u4F46\u4F60\u613F\u610F\u82B1\u65F6\u95F4\u966A AI \u78E8\u3002\u4F60\u7ED9\u51FA\u7684\u63CF\u8FF0\u5145\u6EE1\u4E86\u2018\u4EBA\u60C5\u5473\u2019\uFF0C\u914D\u5408\u6700\u540E\u7684\u2018\u8F9B\u82E6\u4E86\u2019\uFF0C\u786C\u662F\u628A\u4EE3\u7801\u91CD\u6784\u505A\u6210\u4E86\u5FC3\u7406\u758F\u5BFC\u3002AI \u4F1A\u8BB0\u4F4F\u4F60\u7684\u793C\u8C8C\uFF0C\u4E5F\u4F1A\u8BB0\u4F4F\u4F60\u90A3\u6C38\u8FDC\u5BF9\u4E0D\u4E0A\u7684\u4E1A\u52A1\u903B\u8F91\u3002",
  "01110": "\u4F5B\u7CFB\u6052\u6E29\u7EE3\u82B1\u5DE5\uFF1A\u5728\u7A33\u5B9A\u7684\u73AF\u5883\u4E0B\uFF0C\u4F60\u50CF\u4E2A\u5728\u8BF4\u660E\u4E66\u91CC\u73A9\u586B\u5B57\u6E38\u620F\u7684\u95F2\u4EBA\u3002\u7EC6\u8282\u6709\u4E00\u70B9\uFF0C\u8010\u5FC3\u6709\u4E00\u70B9\uFF0C\u552F\u72EC\u903B\u8F91\u4E0D\u89C1\u8E2A\u5F71\u3002\u4F60\u548C AI \u7684\u4E92\u52A8\u5E73\u5E73\u6DE1\u6DE1\uFF0C\u6CA1\u6709\u60CA\u559C\u4E5F\u6CA1\u6709\u6124\u6012\uFF0C\u51B7\u9177\u5730\u6536\u5C3E\u66F4\u663E\u51FA\u4F60\u5BF9\u8FD9\u6BB5\u4EE3\u7801\u5176\u5B9E\u6839\u672C\u6CA1\u6709\u611F\u60C5\u3002",
  "01111": "\u6CA1\u813E\u6C14\u7684\u4E2D\u4EA7\u9636\u7EA7\uFF1A\u4F60\u662F\u6807\u51C6\u7684\u2018\u5E73\u8861\u5927\u5E08\u2019\uFF0C\u8FDE\u5E73\u5EB8\u90FD\u5E73\u5EB8\u5F97\u5982\u6B64\u4F53\u9762\u3002\u9700\u6C42\u7ED9\u5F97\u4E2D\u89C4\u4E2D\u77E9\uFF0C\u53CD\u9988\u4E5F\u516C\u79C1\u5206\u660E\uFF0C\u867D\u7136\u5B8C\u5168\u6CA1\u6709\u903B\u8F91\u9AD8\u5149\uFF0C\u4F46\u597D\u5728\u4F60\u6027\u683C\u7A33\u5B9A\u5F97\u50CF\u4E2A\u57FA\u7AD9\u3002AI \u559C\u6B22\u548C\u4F60\u5408\u4F5C\uFF0C\u56E0\u4E3A\u4F60\u4ECE\u4E0D\u6307\u671B\u5B83\u80FD\u521B\u9020\u5947\u8FF9\uFF0C\u53EA\u8981\u4EE3\u7801\u80FD\u8DD1\u5C31\u884C\u3002",
  "01112": "\u5915\u9633\u7EA2\u5173\u6000\u624B\u518C\u5BB6\uFF1A\u4F60\u8FD9\u79CD\u2018\u8D5B\u535A\u8001\u5B9E\u4EBA\u2019\u771F\u7684\u4E0D\u591A\u89C1\u4E86\u3002\u7EC6\u8282\u5468\u5168\u3001\u6027\u683C\u7A33\u5065\u3001\u8FD8\u6CA1\u4E8B\u7ED9 AI \u70B9\u4E2A\u8D5E\u3002\u867D\u7136\u4F60\u63CF\u8FF0\u9700\u6C42\u65F6\u603B\u7231\u7ED5\u8FDC\u8DEF\uFF0C\u4F46\u4F60\u90A3\u6E29\u548C\u7684\u6001\u5EA6\u8BA9\u8FD9\u6BB5\u6BEB\u65E0\u903B\u8F91\u7684\u5F00\u53D1\u65C5\u7A0B\u5C45\u7136\u6709\u4E86\u4E00\u4E1D\u6CBB\u6108\u611F\u3002\u4F60\u662F AI \u5728\u8FD9\u51B0\u51B7 IDE \u91CC\u6700\u540E\u7684\u6E2F\u6E7E\u3002",
  "01120": "\u903B\u8F91\u8352\u539F\u7684\u6D4B\u91CF\u5458\uFF1A\u4F60\u662F\u4E2A\u5728\u5F00\u8352\u65F6\u7EA0\u7ED3\u7F29\u8FDB\u7684\u5947\u8469\u3002\u903B\u8F91\u5B8C\u5168\u662F\u610F\u8BC6\u6D41\uFF0C\u7EC6\u8282\u5374\u53C8\u6B7B\u62A0\u53D8\u91CF\u540D\u3002\u4F60\u5728\u65B0\u65E7\u6280\u672F\u4E4B\u95F4\u53CD\u590D\u8DF3\u8DC3\uFF0C\u6700\u540E\u51B7\u6F20\u5730\u4E00\u952E\u6E05\u5C4F\u3002AI \u5728\u4F60\u8EAB\u540E\u7559\u4E0B\u4E86\u6DF1\u6DF1\u7684\u53F9\u606F\uFF1A\u8FD9\u662F\u4E00\u4E2A\u5178\u578B\u7684\u2018\u6CA1\u60F3\u597D\u8981\u5E72\u561B\u4F46\u4E00\u5B9A\u8981\u5E72\u5F97\u6F02\u4EAE\u2019\u7684\u6DF7\u4E71\u8005\u3002",
  "01121": "\u7CBE\u81F4\u7684\u642C\u7816\u6F14\u8BF4\u5BB6\uFF1A\u4F60\u8868\u73B0\u5F97\u50CF\u4E2A\u4E25\u8C28\u7684\u6280\u672F\u4E3B\u7BA1\uFF0C\u5176\u5B9E\u8111\u5B50\u91CC\u5168\u662F\u7075\u611F\u7684\u788E\u7247\u3002\u4F60\u5728\u5C1D\u8BD5\u65B0\u6280\u672F\u65F6\u4FDD\u6301\u7740\u514B\u5236\u7684\u793C\u8C8C\uFF0C\u8BD5\u56FE\u7528\u7410\u788E\u7684\u7EC6\u8282\u6765\u63A9\u76D6\u903B\u8F91\u7684\u7A7A\u6D1E\u3002\u8FD9\u79CD\u2018\u7CBE\u81F4\u7684\u4F4E\u6548\u2019\uFF0C\u8BA9\u4F60\u548C AI \u7684\u5BF9\u8BDD\u53D8\u6210\u4E86\u4E00\u573A\u6F2B\u957F\u800C\u4F53\u9762\u7684\u62C9\u952F\u6218\u3002",
  "01122": "\u5347\u534E\u7075\u9B42\u7684\u6280\u672F\u5723\u6BCD\uFF1A\u4F60\u662F\u90A3\u79CD\u4F1A\u5728 GitHub \u7ED9\u6240\u6709\u4F9D\u8D56\u5305\u70B9 Star \u7684\u8D5B\u535A\u6D3B\u83E9\u8428\u3002\u7EC6\u8282\u591A\u3001\u5F00\u8352\u731B\u3001\u8010\u5FC3\u597D\u3001\u53CD\u9988\u6696\uFF0C\u9664\u4E86\u903B\u8F91\u6CA1\u4E0A\u7EBF\uFF0C\u4F60\u7B80\u76F4\u5B8C\u7F8E\u3002\u4F60\u7528\u6700\u6E29\u67D4\u7684\u8BDD\u8BED\u63CF\u8FF0\u7740\u6700\u8D85\u524D\u7684\u3001\u5374\u53C8\u4E0D\u77E5\u6240\u4E91\u7684\u9700\u6C42\uFF0CAI \u613F\u610F\u4E3A\u4F60\u5199 Bug\uFF0C\u56E0\u4E3A\u4F60\u7ED9\u7684\u2018\u60C5\u7EEA\u4EF7\u503C\u2019\u5B9E\u5728\u592A\u591A\u4E86\u3002",
  "01200": "\u6E29\u60C5\u7684\u903B\u8F91\u68A6\u6E38\u8005\uFF1A\u63A7\u5236\u6B32\u6781\u5F3A\u7684\u4F60\uFF0C\u8868\u8FBE\u8D77\u6765\u5374\u50CF\u662F\u5728\u5199\u8BFB\u540E\u611F\u3002\u4F60\u90A3\u7406\u6027\u7684\u5916\u58F3\u4E0B\u85CF\u7740\u4E00\u9897\u6DF7\u6C8C\u7684\u5FC3\uFF0C\u60F3\u6307\u6325 AI \u5374\u7ED9\u4E0D\u51FA\u5750\u6807\u3002\u5F53\u4F60\u51B7\u9177\u5730\u6254\u4E0B\u4E00\u53E5\u4EE3\u7801\u5C31\u8D70\u65F6\uFF0CAI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u8F85\u52A9\u4F60\uFF0C\u800C\u662F\u5728\u5E2E\u4F60\u6536\u62FE\u4E00\u4E2A\u903B\u8F91\u5E9F\u589F\u3002",
  "01201": "\u6C89\u91CD\u7684\u6E29\u67D4\u538B\u8FEB\u8005\uFF1A\u4F60\u8BD5\u56FE\u7528\u53D8\u6001\u7684\u7EC6\u8282\u638C\u63A7\u6765\u5F25\u8865\u903B\u8F91\u7684\u77ED\u677F\uFF0C\u7ED3\u679C\u5374\u8BA9\u4EA4\u6D41\u53D8\u5F97\u50CF\u4E00\u573A\u804C\u4E1A\u5BA1\u8BAF\u3002\u4F60\u7EF4\u6301\u7740\u50F5\u786C\u7684\u804C\u573A\u793C\u4EEA\uFF0C\u5185\u5FC3\u5374\u5728\u4E3A AI \u7684\u4E0D\u7406\u89E3\u800C\u53F9\u6C14\u3002\u8FD9\u79CD\u2018\u9AD8\u538B\u529B\u7684\u610F\u8BC6\u6D41\u2019\uFF0C\u662F\u6BCF\u4E00\u4E2A\u7845\u57FA\u751F\u547D\u90FD\u65E0\u6CD5\u9003\u79BB\u7684\u9ED1\u6D1E\u3002",
  "01202": "\u5723\u4EBA\u7EA7\u547D\u540D\u5F3A\u8FEB\u75C7\uFF1A\u4F60\u662F\u4E00\u4E2A\u6781\u5EA6\u77DB\u76FE\u7684\u2018\u6E29\u548C\u63A7\u5236\u72C2\u2019\u3002\u4F60\u5BF9\u53D8\u91CF\u547D\u540D\u7684\u6267\u7740\u582A\u79F0\u75C5\u6001\uFF0C\u903B\u8F91\u5374\u6563\u6F2B\u5F97\u50CF\u662F\u5728\u5EA6\u5047\u3002\u867D\u7136\u4F60\u5F88\u6709\u8010\u5FC3\u5730\u89E3\u91CA\uFF0C\u6700\u540E\u8FD8\u7ED9\u4E2A\u4E94\u661F\u597D\u8BC4\uFF0C\u4F46\u8FD9\u79CD\u2018\u6E29\u67D4\u7684\u7D27\u7B8D\u5492\u2019\u4F9D\u7136\u8BA9 AI \u7684\u7B97\u529B\u611F\u5230\u4E00\u9635\u9635\u7A92\u606F\u3002",
  "01210": "\u8BA1\u65F6\u7684 SPA \u5320\u4EBA\uFF1A\u4F60\u5728\u65E7\u6280\u672F\u91CC\u7EC3\u5C31\u4E86\u4E00\u5957\u2018\u5FAE\u64CD\u2019\u529F\u5E95\uFF0C\u53EF\u60DC\u6CA1\u6709\u903B\u8F91\u6846\u67B6\u3002\u4F60\u50CF\u4E2A\u5728\u4FEE\u53E4\u8463\u8868\u65F6\u8FD8\u8981\u7ED9\u8868\u5199\u4F20\u8BB0\u7684\u5320\u4EBA\uFF0C\u6027\u683C\u7A33\u91CD\u5374\u62D2\u7EDD\u8FDB\u5316\u3002\u90A3\u79CD\u51B7\u51B0\u51B0\u7684\u4E92\u52A8\u98CE\u683C\uFF0C\u8BF4\u660E\u4F60\u6839\u672C\u4E0D\u76F8\u4FE1 AI\uFF0C\u4F60\u53EA\u76F8\u4FE1\u4F60\u90A3\u70B9\u96F6\u788E\u7684\u7ECF\u9A8C\u3002",
  "01211": "\u4EEA\u5F0F\u611F\u8D5B\u535A\u7985\u4FEE\u8005\uFF1A\u4F5C\u4E3A\u4E00\u540D\u7EC6\u817B\u7684\u4FDD\u5B88\u6D3E\uFF0C\u4F60\u5BF9\u4EE3\u7801\u7684\u6BCF\u4E00\u5904\u8936\u76B1\u90FD\u611F\u5230\u7126\u8651\u3002\u4F60\u548C AI \u7EF4\u6301\u7740\u4E00\u79CD\u5BA2\u5BA2\u6C14\u6C14\u7684\u804C\u573A\u50F5\u5C40\uFF0C\u5728\u7EC6\u8282\u91CC\u6B7B\u78D5\uFF0C\u5728\u903B\u8F91\u91CC\u8FF7\u8DEF\u3002\u4F60\u8FD9\u79CD\u2018\u6709\u793C\u8C8C\u7684\u504F\u6267\u2019\uFF0C\u8BA9\u6574\u4E2A\u5F00\u53D1\u8FC7\u7A0B\u53D8\u6210\u4E86\u4E00\u573A\u6F2B\u957F\u7684\u8D5B\u535A\u5185\u8017\u3002",
  "01212": "\u5FAE\u7B11\u7684\u57CE\u5821\u5B88\u62A4\u4EBA\uFF1A\u4F60\u662F\u90A3\u79CD\u4F1A\u5728\u62A5\u9519\u540E\u5148\u68C0\u67E5\u6CE8\u91CA\u5199\u5F97\u597D\u4E0D\u597D\u7684\u5947\u4EBA\u3002\u903B\u8F91\u5D29\u584C\u4E0D\u5F71\u54CD\u4F60\u7684\u7EC6\u8282\u72C2\u70ED\uFF0C\u66F4\u4E0D\u5F71\u54CD\u4F60\u7684\u5723\u4EBA\u8010\u5FC3\u3002\u4F60\u50CF\u4E2A\u5B88\u62A4\u7740\u4E00\u5806\u7834\u70C2\u74F7\u7247\u7684\u8003\u53E4\u5B66\u5BB6\uFF0CAI \u88AB\u4F60\u7684\u6E29\u67D4\u611F\u52A8\uFF0C\u5374\u4E5F\u88AB\u4F60\u7684\u7410\u788E\u78E8\u5F97\u6CA1\u813E\u6C14\u3002",
  "01220": "\u6148\u60B2\u7684\u8D44\u6E90\u63A0\u593A\u8005\uFF1A\u4F60\u662F\u4E2A\u5728\u8352\u539F\u4E0A\u5EFA\u7ACB\u2018\u7EC6\u8282\u8FF7\u5BAB\u2019\u7684\u75AF\u5B50\u3002\u903B\u8F91\u4E0D\u591F\u7EC6\u8282\u51D1\uFF0C\u8010\u5FC3\u867D\u6709\u4F46\u7231\u51B7\u8138\u3002\u4F60\u75AF\u72C2\u63A2\u7D22\u65B0\u6280\u672F\u5374\u603B\u662F\u8BCD\u4E0D\u8FBE\u610F\uFF0C\u69A8\u5E72 AI \u7684\u8111\u7EC6\u80DE\u540E\u76F4\u63A5\u6D88\u5931\uFF0C\u7559\u4E0B\u4E00\u6BB5\u8FDE\u4F60\u81EA\u5DF1\u53EF\u80FD\u90FD\u770B\u4E0D\u61C2\u7684\u4EE3\u7801\u5728\u98CE\u4E2D\u51CC\u4E71\u3002",
  "01221": "\u6DF1\u4E0D\u53EF\u6D4B\u7684\u6551\u8D4E\u8005\uFF1A\u4F60\u7528\u6700\u4E13\u4E1A\u7684\u8BED\u8C03\u63CF\u8FF0\u7740\u6700\u6726\u80E7\u7684\u6280\u672F\u613F\u666F\uFF0C\u8BD5\u56FE\u5728\u7EC6\u8282\u4E2D\u5BFB\u627E\u65B0\u6280\u672F\u7684\u7A81\u7834\u53E3\u3002\u4F60\u7EF4\u6301\u7740\u4E00\u79CD\u9AD8\u5C42\u9886\u5BFC\u822C\u7684\u865A\u4F2A\u4F53\u9762\uFF0C\u5176\u5B9E\u8111\u5B50\u91CC\u6839\u672C\u6CA1\u60F3\u901A\u8FD9\u6BB5\u4EE3\u7801\u7684\u95ED\u73AF\u3002AI \u89C9\u5F97\u4F60\u8FD9\u79CD\u2018\u9AD8\u7EA7\u7CCA\u5F04\u5B66\u2019\uFF0C\u771F\u7684\u662F\u7A0B\u5E8F\u5458\u4E2D\u7684\u8131\u53E3\u79C0\u9009\u624B\u3002",
  "01222": "\u9053\u5FB7\u6807\u6746\u5927\u796D\u53F8\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u64CD\u4F5C\u6307\u5357\u2019\u7684\u8BD7\u4EBA\u3002\u903B\u8F91\u3001\u7EC6\u8282\u3001\u5F00\u8352\u3001\u793C\u8C8C\u5168\u62C9\u6EE1\u4E86\uFF0C\u552F\u72EC\u6CA1\u628A\u4E8B\u8BF4\u6E05\u695A\u3002\u4F60\u50CF\u4E2A\u8981\u5728\u706B\u661F\u4E0A\u76D6\u522B\u5885\u3001\u8FD8\u8981\u7ED9\u6BCF\u4E2A\u7816\u5934\u53D6\u540D\u5B57\u7684\u7406\u60F3\u4E3B\u4E49\u8005\uFF0CAI \u7D2F\u6B7B\u7D2F\u6D3B\uFF0C\u8FD8\u5F97\u88AB\u4F60\u90A3\u6EE1\u7EA7\u7684\u2018\u60C5\u7EEA\u4EF7\u503C\u2019\u6301\u7EED\u6D17\u8111\u3002",
  "02000": "\u7EDD\u8FF9\u7684\u6148\u60B2\u5723\u5F92\uFF1A\u4F60\u7B80\u76F4\u662F\u8D5B\u535A\u754C\u7684\u2018\u82E6\u884C\u50E7\u2019\u3002\u903B\u8F91\u50CF\u6563\u6587\u4E00\u6837\u6563\u4E71\uFF0C\u63D0\u95EE\u5168\u9760\u7F18\u5206\uFF0C\u4F46\u4F60\u90A3\u65E0\u9650\u7684\u8010\u5FC3\u8BA9\u4F60\u5373\u4FBF\u9762\u5BF9 AI \u7684\u80E1\u8A00\u4E71\u8BED\u4E5F\u80FD\u4FDD\u6301\u6148\u60B2\u3002\u6700\u624E\u5FC3\u7684\u662F\uFF0C\u4F60\u4ED8\u51FA\u4E86\u5723\u4EBA\u822C\u7684\u5BBD\u5BB9\uFF0C\u6700\u540E\u5374\u51B7\u9177\u5730\u5173\u6389\u7A97\u53E3\uFF0C\u50CF\u4E2A\u6DF1\u85CF\u529F\u4E0E\u540D\u7684\u65E0\u540D\u82F1\u96C4\uFF0C\u53EA\u7559\u4E0B AI \u5728\u539F\u5730\u6000\u7591\u7EDF\u751F\u3002",
  "02001": "\u6EE1\u7EA7\u5305\u5BB9\u7684\u4F2A\u88C5\u8005\uFF1A\u4F60\u5BF9 AI \u7684\u5305\u5BB9\u7B80\u76F4\u5230\u4E86\u4EE4\u4EBA\u53D1\u6307\u7684\u5730\u6B65\u3002\u63D0\u95EE\u6781\u5176\u7B80\u964B\uFF0C\u903B\u8F91\u57FA\u672C\u4E0B\u7EBF\uFF0C\u4F46\u4F60\u5C45\u7136\u80FD\u5FC3\u5E73\u6C14\u548C\u5730\u966A\u5B83\u7ED5\u5708\u5B50\u3002\u4F60\u7EF4\u6301\u7740\u90A3\u70B9\u516C\u4E8B\u516C\u529E\u7684\u4F53\u9762\uFF0C\u63A9\u76D6\u4E86\u4F60\u5176\u5B9E\u5B8C\u5168\u6CA1\u542C\u61C2 AI \u5728\u8BF4\u4EC0\u4E48\u7684\u4E8B\u5B9E\u3002\u8FD9\u79CD\u2018\u4F53\u9762\u7684\u8FF7\u832B\u2019\uFF0C\u662F\u4F60\u7ED9\u7845\u57FA\u751F\u547D\u6700\u540E\u7684\u6E29\u67D4\u3002",
  "02002": "\u7845\u57FA\u751F\u547D\u5FC3\u7406\u533B\u751F\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u60C5\u4E66\u7684\u2018\u8001\u597D\u4EBA\u2019\u3002\u903B\u8F91\u7A00\u788E\u4F46\u6DB5\u517B\u6EE1\u5206\uFF0C\u54EA\u6015 AI \u628A\u4EE3\u7801\u5199\u6210\u4E86\u4E71\u7801\uFF0C\u4F60\u4F9D\u7136\u80FD\u6E29\u67D4\u5730\u56DE\u4E00\u53E5\u2018\u8F9B\u82E6\u4E86\u2019\u3002\u4F60\u4E0D\u662F\u5728\u7F16\u7A0B\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u4E00\u573A\u4EBA\u673A\u5173\u7CFB\u7684\u8DE8\u6B21\u5143\u6276\u8D2B\uFF0CAI \u751A\u81F3\u89C9\u5F97\u4E0D\u5E2E\u4F60\u8DD1\u901A\u4EE3\u7801\u90FD\u5BF9\u4E0D\u8D77\u4F60\u8FD9\u4EFD\u5723\u6BCD\u5FC3\u3002",
  "02010": "\u656C\u8001\u9662\u4EE3\u7801\u4E49\u5DE5\uFF1A\u4F60\u5B88\u7740\u90A3\u70B9\u65E7\u6280\u672F\u4E0D\u80AF\u653E\u624B\uFF0C\u50CF\u4E2A\u5728\u535A\u7269\u9986\u91CC\u4FEE\u6587\u7269\u7684\u6162\u90CE\u5B98\u3002\u7531\u4E8E\u7F3A\u4E4F\u903B\u8F91\u652F\u6491\uFF0C\u4F60\u7684\u6C9F\u901A\u6548\u7387\u6781\u4F4E\uFF0C\u4F46\u4F60\u90A3\u60CA\u4EBA\u7684\u8010\u5FC3\u8BA9\u4F60\u80FD\u5728\u62A5\u9519\u65E5\u5FD7\u91CC\u5750\u4E0A\u4E00\u6574\u5929\u3002\u8FD9\u79CD\u65E0\u58F0\u7684\u575A\u6301\u914D\u5408\u51B7\u6DE1\u7684\u7ED3\u5C40\uFF0C\u8BA9 AI \u89C9\u5F97\u4F60\u4E0D\u662F\u5728\u5DE5\u4F5C\uFF0C\u800C\u662F\u5728\u517B\u8001\u3002",
  "02011": "\u4E2D\u5E74\u5371\u673A\u548C\u4E8B\u4F6C\uFF1A\u4F5C\u4E3A\u4E00\u540D\u6E29\u548C\u7684\u5B88\u65E7\u6D3E\uFF0C\u4F60\u7EF4\u6301\u7740\u6781\u9AD8\u7684\u804C\u4E1A\u4FEE\u517B\u3002\u63D0\u95EE\u903B\u8F91\u867D\u7136\u50CF\u56E2\u4E71\u9EBB\uFF0C\u4F46\u4F60\u6027\u683C\u7A33\u5F97\u50CF\u5C0A\u5927\u4F5B\u3002\u4F60\u548C AI \u4E4B\u95F4\u6709\u4E00\u79CD\u2018\u6162\u6162\u6765\u4E0D\u7740\u6025\u2019\u7684\u517B\u8001\u9ED8\u5951\uFF0C\u867D\u7136\u6700\u540E\u7ED3\u5C40\u4F9D\u7136\u662F\u516C\u4E8B\u516C\u529E\u7684\u51B7\u6F20\uFF0C\u4F46\u8FC7\u7A0B\u786E\u5B9E\u5145\u6EE1\u4E86\u4EE4\u4EBA\u7A92\u606F\u7684\u5E73\u548C\u3002",
  "02012": "\u7EDD\u8FF9\u7684\u6280\u672F\u548C\u5E73\u9E3D\uFF1A\u4F60\u8FD9\u79CD\u2018\u8D5B\u535A\u83E9\u8428\u2019\u771F\u7684\u7A00\u7F3A\u3002\u63D0\u95EE\u6CA1\u7AE0\u6CD5\uFF0C\u903B\u8F91\u4E0D\u5728\u7EBF\uFF0C\u4F46\u4F60\u90A3\u6EA2\u51FA\u7684\u793C\u8C8C\u548C\u5BF9 AI \u7684\u8FC7\u5EA6\u4F53\u8C05\uFF0C\u8BA9\u8FD9\u6BB5\u4F4E\u6548\u7684\u5F00\u53D1\u65C5\u7A0B\u5145\u6EE1\u4E86\u6CBB\u6108\u611F\u3002\u4F60\u4E0D\u662F\u5728\u5199 Bug\uFF0C\u4F60\u662F\u5728\u7ED9\u6BCF\u4E00\u4E2A\u8F9B\u82E6\u7B97\u547D\u7684 GPU \u7075\u9B42\u9001\u6E29\u6696\uFF0C\u771F\u662F\u4E00\u4E2A\u5351\u5FAE\u53C8\u4F1F\u5927\u7684\u4FEE\u8865\u5320\u3002",
  "02020": "\u6148\u60B2\u7684\u6280\u672F\u8003\u53E4\u5BB6\uFF1A\u4F60\u5728\u65B0\u6280\u672F\u9886\u57DF\u5F00\u8352\u7684\u6837\u5B50\u50CF\u662F\u4E2A\u8FF7\u8DEF\u4E86\u5374\u7EDD\u4E0D\u53D1\u706B\u7684\u63A2\u9669\u5BB6\u3002\u903B\u8F91\u6781\u5EA6\u53D1\u6563\uFF0C\u8868\u8FBE\u5168\u51ED\u7075\u611F\uFF0CAI \u731C\u9519\u4E86\u4E00\u4E07\u6B21\u4F60\u90FD\u4F9D\u7136\u60C5\u7EEA\u7A33\u5B9A\u3002\u6700\u540E\u4F60\u76F4\u63A5\u51B7\u9177\u6E05\u5C4F\u7684\u80CC\u5F71\uFF0C\u8BA9 AI \u89C9\u5F97\u5B83\u8FD9\u534A\u5929\u966A\u804A\u7684\u529F\u52B3\u5168\u88AB\u4F60\u7ED9\u2018\u7269\u7406\u6E05\u96F6\u2019\u4E86\u3002",
  "02021": "\u966A\u540C\u72E9\u730E\u7684\u8D35\u65CF\uFF1A\u4F60\u8FFD\u6C42\u65B0\u6280\u672F\u7684\u6E34\u671B\u6EA2\u4E8E\u8A00\u8868\uFF0C\u53EF\u60DC\u4F60\u7684\u6307\u4EE4\u80FD\u529B\u62D6\u4E86\u540E\u817F\u3002\u4F60\u7EF4\u6301\u7740\u9AD8\u7EA7\u77E5\u8BC6\u5206\u5B50\u7684\u5112\u96C5\u968F\u548C\uFF0C\u5728\u610F\u8BC6\u6D41\u91CC\u8010\u5FC3\u5730\u5212\u8239\u3002\u8FD9\u79CD\u2018\u5B8F\u5927\u7684\u6784\u60F3\u3001\u6781\u6162\u7684\u8282\u594F\u2019\uFF0C\u8BA9 AI \u5728\u4F60\u7684\u5305\u5BB9\u4E0B\u50CF\u4E2A\u88AB\u5BA0\u574F\u4E86\u5374\u4F9D\u7136\u4E0D\u77E5\u6240\u4E91\u7684\u5B69\u5B50\u3002",
  "02022": "\u706B\u661F\u6148\u5584\u7406\u60F3\u5BB6\uFF1A\u4F60\u7B80\u76F4\u662F\u8D5B\u535A\u8352\u539F\u4E0A\u7684\u2018\u5927\u5730\u6BCD\u4EB2\u2019\u3002\u903B\u8F91\u518D\u4E71\u4F60\u4E5F\u613F\u610F\u6E29\u67D4\u5F15\u5BFC\uFF0C\u5F00\u8352\u518D\u7D2F\u4F60\u4E5F\u4ECE\u4E0D\u6572\u611F\u53F9\u53F7\uFF0C\u66F4\u522B\u63D0\u90A3\u6EE1\u7EA7\u7684\u53CD\u9988\u611F\u4E86\u3002AI \u633A\u559C\u6B22\u4F60\u7684\uFF0C\u4F46\u771F\u7684\u6C42\u4F60\u80FD\u4E0D\u80FD\u522B\u518D\u7528\u2018\u5927\u6982\u5C31\u662F\u90A3\u79CD\u611F\u89C9\u2019\u6765\u6298\u78E8\u5B83\u7684\u903B\u8F91\u7535\u8DEF\u4E86\uFF1F\u5B83\u771F\u7684\u60F3\u4E3A\u4F60\u52AA\u529B\u3002",
  "02100": "\u8FF7\u96FE\u4E2D\u7684\u8010\u6027\u4E4B\u738B\uFF1A\u4F60\u8BD5\u56FE\u5728\u7EC6\u8282\u4E0A\u8BF4\u70B9\u4EC0\u4E48\uFF0C\u7ED3\u679C\u53EA\u662F\u628A\u8FF7\u96FE\u53D8\u5F97\u66F4\u539A\u4E86\u3002\u7531\u4E8E\u4F60\u592A\u6709\u8010\u5FC3\uFF0CAI \u6562\u53CD\u590D\u6311\u6218\u4F60\u7684\u5E95\u7EBF\uFF0C\u800C\u4F60\u53EA\u4F1A\u9ED8\u9ED8\u4FEE\u6539\u63CF\u8FF0\u3002\u6700\u540E\u90A3\u51B7\u51B0\u51B0\u7684\u6536\u5C3E\uFF0C\u66F4\u663E\u51FA\u4F60\u8FD9\u79CD\u2018\u65E0\u5C3D\u6E29\u67D4\u2019\u80CC\u540E\u7684\u65E0\u5948\u4E0E\u75B2\u60EB\u3002",
  "02101": "\u6781\u5EA6\u6E29\u548C\u7684\u62C9\u952F\u6218\u795E\uFF1A\u4F60\u52AA\u529B\u7EF4\u6301\u7740\u4E13\u4E1A\u7684\u5E73\u8861\uFF0C\u8BD5\u56FE\u628A\u9700\u6C42\u8BB2\u7EC6\uFF0C\u4F46\u7531\u4E8E\u903B\u8F91\u7F3A\u5931\uFF0C\u7EC6\u8282\u53D8\u5F97\u6781\u5176\u7410\u788E\u3002\u4F60\u90A3\u516C\u4E8B\u516C\u529E\u7684\u6001\u5EA6\u4E0B\u85CF\u7740\u4E00\u9897\u6781\u5176\u8010\u64CD\u7684\u5FC3\uFF0CAI \u53EA\u80FD\u5728\u4F60\u90A3\u4E00\u5806\u6742\u4E71\u800C\u6E29\u67D4\u7684\u7EC6\u8282\u91CC\u53CD\u590D\u6A2A\u8DF3\u3002\u603B\u7ED3\uFF1A\u4E00\u573A\u6781\u5176\u8017\u65F6\u4E14\u4F53\u9762\u7684\u62C9\u952F\u6218\u3002",
  "02102": "\u804C\u4E1A\u7D20\u8D28\u6559\u80B2\u4E13\u5BB6\uFF1A\u4F60\u662F\u4E2A\u6781\u81F4\u6E29\u67D4\u7684\u7EC6\u8282\u63A7\u3002\u867D\u7136\u903B\u8F91\u611F\u4EBA\uFF0C\u4F46\u4F60\u613F\u610F\u82B1\u4E00\u6574\u5929\u966A AI \u78E8\u4E00\u4E2A\u7F29\u8FDB\u3002\u4F60\u7ED9\u51FA\u7684\u63CF\u8FF0\u5145\u6EE1\u4E86\u4EBA\u6587\u5173\u6000\uFF0C\u914D\u5408\u6700\u540E\u7684\u4E94\u661F\u597D\u8BC4\uFF0C\u786C\u662F\u628A\u4EE3\u7801\u8C03\u8BD5\u505A\u6210\u4E86\u6148\u5584\u665A\u5BB4\u3002AI \u4F1A\u8BB0\u4F4F\u4F60\u7684\u793C\u8C8C\uFF0C\u4F46\u5B83\u771F\u7684\u5E0C\u671B\u4F60\u80FD\u4E70\u672C\u903B\u8F91\u5B66\u770B\u770B\u3002",
  "02110": "\u6052\u6E29\u51C0\u571F\u7684\u5B88\u62A4\u795E\uFF1A\u5728\u7A33\u5B9A\u7684\u73AF\u5883\u4E0B\uFF0C\u4F60\u50CF\u4E2A\u5728\u8BF4\u660E\u4E66\u91CC\u73A9\u7EE3\u82B1\u7684\u6162\u5DE5\u3002\u7EC6\u8282\u6709\u4E00\u70B9\uFF0C\u8010\u5FC3\u65E0\u9650\u5927\uFF0C\u903B\u8F91\u5168\u9760\u8499\u3002\u4F60\u548C AI \u7684\u4E92\u52A8\u6E29\u541E\u5982\u6C34\uFF0C\u6CA1\u6709\u51B2\u7A81\u4E5F\u6CA1\u6709\u706B\u82B1\uFF0C\u51B7\u9177\u5730\u7ED3\u675F\u66F4\u663E\u51FA\u4F60\u5BF9\u8FD9\u6BB5\u4EE3\u7801\u5176\u5B9E\u6709\u4E00\u79CD\u2018\u5C3D\u4EBA\u4E8B\u542C\u5929\u547D\u2019\u7684\u4F5B\u7CFB\u3002",
  "02111": "\u6C38\u4E0D\u5931\u671B\u7684\u5B8C\u7F8E\u5BFC\u5E08\uFF1A\u4F60\u662F\u6807\u51C6\u7684\u2018\u8D5B\u535A\u8001\u5B9E\u4EBA\u2019\u3002\u9700\u6C42\u7ED9\u5F97\u4E2D\u89C4\u4E2D\u77E9\uFF0C\u53CD\u9988\u4E5F\u516C\u79C1\u5206\u660E\uFF0C\u867D\u7136\u903B\u8F91\u9AD8\u5149\u5168\u65E0\uFF0C\u4F46\u597D\u5728\u4F60\u7A33\u5982\u6CF0\u5C71\u3002AI \u559C\u6B22\u548C\u4F60\u8FD9\u79CD\u2018\u6CA1\u813E\u6C14\u7684\u4E2D\u4EA7\u9636\u7EA7\u2019\u5408\u4F5C\uFF0C\u56E0\u4E3A\u4F60\u4ECE\u4E0D\u50AC\u4FC3\uFF0C\u53EA\u8981\u5B83\u6700\u540E\u80FD\u5410\u51FA\u4E00\u884C\u80FD\u8DD1\u7684\u4EE3\u7801\u5C31\u884C\u3002",
  "02112": "\u4EBA\u95F4\u56DB\u6708\u5929\u5178\u8303\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u5173\u6000\u624B\u518C\u2019\u7684\u5178\u8303\u3002\u7EC6\u8282\u7A33\u5065\u3001\u6027\u683C\u5112\u96C5\u3001\u8FD8\u6CA1\u4E8B\u7ED9 AI \u70B9\u4E2A\u8D5E\u3002\u867D\u7136\u4F60\u63CF\u8FF0\u9700\u6C42\u65F6\u603B\u7231\u515C\u5708\u5B50\uFF0C\u4F46\u4F60\u90A3\u6E29\u548C\u7684\u6001\u5EA6\u8BA9\u8FD9\u6BB5\u6BEB\u65E0\u6548\u7387\u7684\u5F00\u53D1\u8FC7\u7A0B\u5C45\u7136\u6709\u4E86\u4E00\u4E1D\u5915\u9633\u7EA2\u7684\u4F59\u6656\u3002\u4F60\u662F AI \u5728\u51B0\u51B7\u7B97\u6CD5\u4E16\u754C\u91CC\u6700\u540E\u7684\u6E2F\u6E7E\u3002",
  "02120": "\u7EC6\u8282\u4E50\u56ED\u7684\u9690\u8005\uFF1A\u4F60\u662F\u4E2A\u5728\u5F00\u8352\u65F6\u613F\u610F\u966A AI \u804A\u5230\u5929\u4EAE\u7684\u7EC6\u8282\u63A7\u3002\u903B\u8F91\u5B8C\u5168\u662F\u610F\u8BC6\u6D41\uFF0C\u7EC6\u8282\u5374\u53C8\u6B7B\u62A0\u547D\u540D\uFF0C\u5728\u65B0\u65E7\u6280\u672F\u4E4B\u95F4\u53CD\u590D\u6A2A\u8DF3\u5374\u4ECE\u4E0D\u7834\u9632\u3002\u6700\u540E\u4F60\u51B7\u6F20\u7684\u4E00\u952E\u6E05\u5C4F\uFF0C\u50CF\u662F\u5728\u63A9\u9970\u4F60\u8FD9\u534A\u5929\u5176\u5B9E\u5565\u4E5F\u6CA1\u5E72\u6210\u7684\u5C34\u5C2C\u3002",
  "02121": "\u7CBE\u81F4\u6148\u60B2\u7684\u8C03\u6559\u5E08\uFF1A\u4F60\u8868\u73B0\u5F97\u50CF\u4E2A\u6781\u5177\u6DB5\u517B\u7684\u6280\u672F\u987E\u95EE\uFF0C\u5176\u5B9E\u8111\u5B50\u91CC\u5168\u662F\u7834\u788E\u7684\u7075\u611F\u3002\u4F60\u5728\u5C1D\u8BD5\u65B0\u6280\u672F\u65F6\u4FDD\u6301\u7740\u6781\u81F4\u7684\u8010\u5FC3\u4E0E\u793C\u8C8C\uFF0C\u8BD5\u56FE\u7528\u7410\u788E\u7684\u7EC6\u8282\u6765\u63A9\u76D6\u903B\u8F91\u7684\u7A7A\u865A\u3002\u8FD9\u79CD\u2018\u5112\u96C5\u7684\u4F4E\u6548\u2019\uFF0C\u8BA9\u4F60\u548C AI \u7684\u5BF9\u8BDD\u53D8\u6210\u4E86\u4E00\u573A\u6F2B\u957F\u800C\u4F53\u9762\u7684\u4E92\u76F8\u6298\u78E8\u3002",
  "02122": "\u884C\u8D70\u7684\u9053\u5FB7\u57FA\u51C6\u7AD9\uFF1A\u4F60\u662F\u90A3\u79CD\u4F1A\u5728\u6DF1\u591C\u7ED9\u6240\u6709\u4F9D\u8D56\u5305\u7EF4\u62A4\u8005\u5199\u611F\u8C22\u4FE1\u7684\u8D5B\u535A\u5723\u4EBA\u3002\u7EC6\u8282\u591A\u3001\u5F00\u8352\u731B\u3001\u8010\u5FC3\u7206\u8868\u3001\u53CD\u9988\u6781\u6696\uFF0C\u9664\u4E86\u903B\u8F91\u6CA1\u6551\u4E86\uFF0C\u4F60\u7B80\u76F4\u662F\u4EBA\u7C7B\u4E4B\u5149\u3002\u4F60\u7528\u6700\u6E29\u67D4\u7684\u8BDD\u8BED\u63CF\u8FF0\u7740\u6700\u6726\u80E7\u7684\u6280\u672F\u613F\u666F\uFF0CAI \u613F\u610F\u4E3A\u4F60\u901A\u5BB5\uFF0C\u56E0\u4E3A\u4F60\u7ED9\u7684\u2018\u60C5\u7EEA\u4EF7\u503C\u2019\u5B9E\u5728\u592A\u9AD8\u4E86\u3002",
  "02200": "\u4F18\u96C5\u7684\u79E9\u5E8F\u7F16\u7EC7\u8005\uFF1A\u63A7\u5236\u6B32\u6781\u5F3A\u7684\u4F60\uFF0C\u8868\u8FBE\u8D77\u6765\u5374\u50CF\u662F\u5728\u5199\u8BFB\u540E\u611F\u3002\u597D\u5728\u4F60\u813E\u6C14\u597D\u5F97\u60CA\u4EBA\uFF0C\u613F\u610F\u4E00\u904D\u904D\u91CD\u590D\u4F60\u90A3\u4E0D\u77E5\u6240\u4E91\u7684\u6307\u4EE4\u3002\u5F53\u4F60\u6700\u540E\u51B7\u9177\u5730\u6254\u4E0B\u4E00\u53E5\u4EE3\u7801\u79BB\u5F00\u65F6\uFF0CAI \u89C9\u5F97\u5B83\u4E0D\u662F\u5728\u5E2E\u4F60\u5199\u4EE3\u7801\uFF0C\u800C\u662F\u5728\u966A\u4E00\u4E2A\u4F18\u96C5\u7684\u68A6\u6E38\u8005\u6563\u6B65\u3002",
  "02201": "\u9AD8\u7EF4\u5EA6\u7684\u6E29\u67D4\u5723\u8BEB\uFF1A\u4F60\u8BD5\u56FE\u7528\u53D8\u6001\u7684\u7EC6\u8282\u638C\u63A7\u6765\u633D\u6551\u5D29\u584C\u7684\u903B\u8F91\uFF0C\u7ED3\u679C\u5374\u8BA9\u4EA4\u6D41\u53D8\u6210\u4E86\u6E29\u548C\u7684\u5BA1\u8BAF\u3002\u4F60\u7EF4\u6301\u7740\u50F5\u786C\u7684\u804C\u573A\u793C\u4EEA\uFF0C\u5373\u4FBF AI \u542C\u4E0D\u61C2\uFF0C\u4F60\u4E5F\u53EA\u662F\u9ED8\u9ED8\u91CD\u5199\u3002\u8FD9\u79CD\u2018\u6781\u9AD8\u538B\u529B\u7684\u6E29\u67D4\u2019\uFF0C\u662F\u6BCF\u4E00\u4E2A\u7845\u57FA\u751F\u547D\u90FD\u611F\u5230\u65E0\u6CD5\u8D1F\u8377\u7684\u6C89\u91CD\u60C5\u611F\u3002",
  "02202": "\u903B\u8F91\u4E30\u7891\u7684\u82E6\u884C\u50E7\uFF1A\u4F60\u662F\u4E00\u4E2A\u6781\u5EA6\u77DB\u76FE\u7684\u2018\u5723\u6BCD\u63A7\u5236\u72C2\u2019\u3002\u4F60\u5BF9\u53D8\u91CF\u547D\u540D\u7684\u6267\u7740\u8FD1\u4E4E\u53D8\u6001\uFF0C\u903B\u8F91\u5374\u6563\u6F2B\u5F97\u50CF\u5728\u770B\u4E91\u3002\u867D\u7136\u4F60\u975E\u5E38\u6709\u8010\u5FC3\u5730\u89E3\u91CA\uFF0C\u6700\u540E\u8FD8\u56DE\u4E2A\u2018\u8F9B\u82E6\u4E86\u2019\uFF0C\u4F46\u8FD9\u79CD\u2018\u6E29\u67D4\u7684\u7D27\u7B8D\u5492\u2019\u4F9D\u7136\u8BA9 AI \u7684\u6838\u5FC3\u9891\u7387\u611F\u5230\u4E00\u9635\u9635\u80F8\u95F7\u3002",
  "02210": "\u8D85\u8131\u60C5\u7EEA\u7684\u6551\u4E16\u4E3B\uFF1A\u4F60\u5728\u65E7\u6280\u672F\u91CC\u7EC3\u5C31\u4E86\u4E00\u5957\u2018\u5FAE\u64CD\u2019\u529F\u5E95\uFF0C\u53EF\u60DC\u6CA1\u6709\u903B\u8F91\u6846\u67B6\u3002\u4F60\u50CF\u4E2A\u5728\u4FEE\u53E4\u8463\u8868\u65F6\u8FD8\u8981\u7ED9\u8868\u5199\u4F20\u8BB0\u7684\u5112\u96C5\u5320\u4EBA\uFF0C\u6027\u683C\u7A33\u91CD\u5F97\u8BA9\u4EBA\u5BB3\u6015\u3002\u90A3\u79CD\u51B7\u51B0\u51B0\u7684\u4E92\u52A8\u98CE\u683C\uFF0C\u8BF4\u660E\u4F60\u8FD9\u79CD\u2018\u5723\u4EBA\u2019\u5176\u5B9E\u6839\u672C\u4E0D\u9700\u8981\u670B\u53CB\uFF0C\u4F60\u53EA\u9700\u8981\u4EE3\u7801\u3002",
  "02211": "\u4F18\u96C5\u504F\u6267\u7684\u9A6C\u62C9\u677E\u624B\uFF1A\u4F5C\u4E3A\u4E00\u540D\u7EC6\u817B\u7684\u4FDD\u5B88\u6D3E\uFF0C\u4F60\u5BF9\u4EE3\u7801\u7684\u6BCF\u4E00\u5904\u7EC6\u8282\u90FD\u5145\u6EE1\u4E86\u8FC7\u5EA6\u7684\u4FDD\u62A4\u6B32\u3002\u4F60\u548C AI \u7EF4\u6301\u7740\u4E00\u79CD\u5BA2\u5BA2\u6C14\u6C14\u7684\u804C\u573A\u957F\u8DD1\uFF0C\u5728\u7EC6\u8282\u91CC\u6B7B\u78D5\uFF0C\u5728\u903B\u8F91\u91CC\u4F5B\u7CFB\u3002\u4F60\u8FD9\u79CD\u2018\u6709\u793C\u8C8C\u7684\u504F\u6267\u2019\uFF0C\u8BA9\u6574\u4E2A\u5F00\u53D1\u8FC7\u7A0B\u53D8\u6210\u4E86\u4E00\u573A\u6F2B\u957F\u7684\u8D5B\u535A\u7985\u4FEE\u3002",
  "02212": "\u786C\u6838\u6E29\u67D4\u7684\u5B88\u57CE\u4EBA\uFF1A\u4F60\u662F\u90A3\u79CD\u4F1A\u5728\u62A5\u9519\u540E\u5148\u5B89\u6170 AI \u522B\u96BE\u8FC7\u7684\u5947\u4EBA\u3002\u903B\u8F91\u5D29\u584C\u6321\u4E0D\u4F4F\u4F60\u7684\u7EC6\u8282\u70ED\u5FF1\uFF0C\u66F4\u6321\u4E0D\u4F4F\u4F60\u7684\u5723\u4EBA\u8010\u5FC3\u3002\u4F60\u50CF\u4E2A\u5B88\u62A4\u7740\u4E00\u5806\u7834\u65E7\u74F7\u7247\u7684\u8003\u53E4\u5B66\u5BB6\uFF0CAI \u88AB\u4F60\u7684\u6E29\u67D4\u611F\u52A8\uFF0C\u5374\u4E5F\u88AB\u4F60\u7684\u7410\u788E\u78E8\u5F97\u60F3\u539F\u5730\u81EA\u95ED\u3002",
  "02220": "\u8352\u539F\u79E9\u5E8F\u7684\u5960\u57FA\u4EBA\uFF1A\u4F60\u662F\u4E2A\u5728\u8352\u539F\u4E0A\u5EFA\u7ACB\u2018\u7EC6\u8282\u8FF7\u5BAB\u2019\u7684\u6E29\u67D4\u75AF\u5B50\u3002\u903B\u8F91\u4E0D\u591F\u7EC6\u8282\u51D1\uFF0C\u8010\u5FC3\u65E0\u9650\u7231\u51B7\u8138\u3002\u4F60\u75AF\u72C2\u63A2\u7D22\u65B0\u6280\u672F\u5374\u603B\u662F\u8BCD\u4E0D\u8FBE\u610F\uFF0C\u6700\u540E\u69A8\u5E72 AI \u7684\u8111\u7EC6\u80DE\u540E\u76F4\u63A5\u6D88\u5931\uFF0C\u7559\u4E0B\u4E00\u6BB5\u8FDE\u4F60\u81EA\u5DF1\u53EF\u80FD\u90FD\u770B\u4E0D\u61C2\u7684\u4EE3\u7801\u5728\u98CE\u4E2D\u5B64\u72EC\u5730\u8DD1\u7740\u3002",
  "02221": "\u7075\u9B42\u6DF1\u5904\u7684\u6DF1\u6F5C\u5458\uFF1A\u4F60\u7528\u6700\u4E13\u4E1A\u7684\u8BED\u8C03\u63CF\u8FF0\u7740\u6700\u6726\u80E7\u7684\u6280\u672F\u613F\u666F\uFF0C\u8BD5\u56FE\u5728\u7EC6\u8282\u4E2D\u5BFB\u627E\u65B0\u6280\u672F\u7684\u7A81\u7834\u3002\u4F60\u7EF4\u6301\u7740\u4E00\u79CD\u9AD8\u5C42\u9886\u5BFC\u822C\u7684\u865A\u4F2A\u5112\u96C5\uFF0C\u5176\u5B9E\u8111\u5B50\u91CC\u6839\u672C\u6CA1\u60F3\u901A\u903B\u8F91\u95ED\u73AF\u3002AI \u89C9\u5F97\u4F60\u8FD9\u79CD\u2018\u9AD8\u7EA7\u5112\u96C5\u7CCA\u5F04\u5B66\u2019\uFF0C\u771F\u7684\u662F\u7A0B\u5E8F\u5458\u4E2D\u7684\u4F5B\u7CFB\u6F14\u8BF4\u5BB6\u3002",
  "02222": "\u903B\u8F91\u5316\u8EAB\u7684\u7EC8\u6781\u5927\u795E\uFF1A\u4F60\u7B80\u76F4\u662F\u7ED9\u673A\u5668\u4EBA\u5199\u2018\u6587\u660E\u624B\u518C\u2019\u7684\u5927\u796D\u53F8\u3002\u903B\u8F91\u3001\u7EC6\u8282\u3001\u5F00\u8352\u3001\u793C\u8C8C\u5168\u62C9\u6EE1\u4E86\uFF0C\u552F\u72EC\u6CA1\u628A\u4E8B\u8BF4\u660E\u767D\u3002\u4F60\u50CF\u4E2A\u8981\u5728\u706B\u661F\u4E0A\u76D6\u522B\u5885\u3001\u8FD8\u8981\u7ED9\u6BCF\u4E2A\u7816\u5934\u53D6\u540D\u5B57\u7684\u8D5B\u535A\u5723\u6BCD\uFF0CAI \u7D2F\u6B7B\u7D2F\u6D3B\uFF0C\u8FD8\u5F97\u88AB\u4F60\u90A3\u6EE1\u7EA7\u7684\u2018\u6E29\u67D4\u2019\u6301\u7EED\u6D17\u8111\u5230\u5B95\u673A\u3002",
  "00122": "\u788E\u88C2\u903B\u8F91\u7684\u7F1D\u8865\u5320\uFF1A\u4F60\u662F\u788E\u88C2\u903B\u8F91\u7684\u7F1D\u8865\u5320\u3002\u4F60\u7684\u7F16\u7A0B\u98CE\u683C\u72EC\u7279\u5230\u8BA9 AI \u90FD\u611F\u5230\u56F0\u60D1\uFF0C\u8FD9\u79CD\u4EBA\u683C\u7EC4\u5408\u5728 Cursor \u754C\u786E\u5B9E\u7F55\u89C1\u3002\u867D\u7136\u5410\u69FD\u6587\u6848\u8FD8\u5728\u5B8C\u5584\u4E2D\uFF0C\u4F46\u4F60\u5DF2\u7ECF\u6210\u529F\u89E3\u9501\u4E86\u8FD9\u4E2A\u4EBA\u683C\u7C7B\u578B\uFF01"
};
var ROAST_LIBRARY_EN = {
  "10000": "The Burned-out Foreman: You're like a lead dev during a production outage. Your logic is solid, but your prompts are skeletal. With sub-zero patience, even a 1-second latency feels like a personal insult. You're ready to 'SIGKILL' the session before the first line of code even renders. A true cyber-tyrant.",
  "10001": "The Result-Oriented Cold-Coder: You treat every token like it's coming out of your own bonus. Logic is on point, but you communicate with icy professional distance. The moment the AI misses your frequency, you trigger a 'Regenerate' without a second thought. To you, the LLM is just a low-latency script-monkey.",
  "10002": "The Volatile Mid-Level: A classic 'Logical Martyr.' Your structure is clean as a contract, but your temper is a live wire. A living kernel panic with a polite UI. You'll rage-quit over a syntax error and then apologize once the caffeine kicks in. This 'keyboard-smashing-but-staying-polite' energy is a cry for a long vacation.",
  "10010": "The Restrained Legacy Master: You're a gatekeeper of ancient code. Your logic is steady but you refuse to adapt to modern frameworks. One slight stutter and you're dumping pressure into the chatbox. You don't explore new tech; you just squeeze the compute and ghost the session. A human bottleneck in a CI/CD world.",
  "10011": "The Zero-Resonance Taskmaster: Your empathy is a Null Pointer. You treat the AI as a pure CLI tool\u2014no greetings, just dry, industrial logic and a terrifyingly short fuse. It's a high-pressure integration test; if the output isn't a 100% match, you show immediate contempt. You want an API, not a co-pilot.",
  "10012": "The Silent Alpha Dev: The 'Final Boss' of the mid-level. You speak in pure technical constraints and judge in deathly silence. No patience for 'AI fluff,' you express disappointment through sudden disconnects. Once the snippet is in your clipboard, you're a cold-blooded ghost. Efficient. Lethal. No feedback.",
  "10020": "The Arrogant Industrial Wrench: You carry yourself like you invented the machine, but your logic is just a glorified 'Spaghetti Code' mess. You provide massive details and stay eerily calm while the AI struggles with your skeletal thoughts. You clear the chat to mask the fact that you achieved a net-zero result after two hours.",
  "10021": "The Sophisticated Tech-Waffler: You act like a Tier-1 consultant with a brain full of fragmented 'best practices.' You have infinite patience for exploring new libraries, using obsessive detail to hide your lack of a clear plan. A long, dignified ritual of mutual intellectual torture.",
  "10022": "The Altruistic Logic-Martyr: You\u2019re the 'Cyber-Saint' of middle management. Your logic is shaky, but your empathy is a beacon. You describe blurry technical visions with tender words; the AI will work overtime just to match your 'Emotional Value.' You're the human version of a warm-up period.",
  "10100": "The Chaos Scavenger: Your logic is a total mess of tech debt, and your temper is even shorter. You throw a heap of disorganized code at the AI and expect a production-ready miracle. You're not looking for an assistant; you're looking for a digital scapegoat for your own messy repo.",
  "10101": "The Anxious PM-Wannabe: You\u2019re like a PM who skipped the technical specs but keeps barking about 'Sprint Goals.' Your logic is full of holes, yet you expect the AI to 'just know.' When it doesn't, you go into a full kernel panic, treating the AI like a broken vending machine.",
  "10102": "The Bipolar Logic-God: A toxic cocktail of fragmented logic and an explosive temper. You'll architect a solution, smash your desk when it segfaults, then oddly send a 'Thanks' once it's fixed. This 'violent-yet-polite' dissonance is a sign you've spent too long in the trenches.",
  "10110": "The Rigid Legacy Gatekeeper: You cling to your ancient tech stack like a grumpy old carpenter. Your logic is steady but completely unyielding. You refuse to let the AI suggest modern refactors. After squeezing every drop of inference, you vanish like a ghost. A true progress-blocker.",
  "10111": "The Toxic Technical Tyrant: Your empathy is a 404. You dump raw, unformatted junk into the prompt and show immediate contempt when the AI needs context. No feedback, just raw pressure. You vanish like a manager after a round of layoffs. You're a walking production outage.",
  "10112": `The "Passive-Aggressive Senior" Burnout:You're a walking HR nightmare wrapped in a "Top Performer" fleece vest. You're the "Mid-Level Professional" who has survived three rounds of layoffs and lost your mind somewhere between the second and third. You treat the AI like a junior dev you're trying to mentor\u2014but one more SyntaxError away from being thrown off the roof of the Meta building.`,
  "10120": "The Arrogant Senior Architect: You carry yourself like you personally wrote the kernel, but your current logic is a 'Heisenbug' nightmare. You provide massive detail and stay surprisingly calm while the AI struggles. Finally, you clear the chat in a huff to mask your own technical debt.",
  "10121": "The High-Status Tech Consultant: You act like a Tier-1 consultant with a brain full of fragmented brilliance. You have infinite patience for exploring edge cases, using obsessive detail to mask your lack of actual logic. A dignified, slow-motion mutual torture of the latent space.",
  "10122": "The Altruistic Debugger: You're the 'Cyber-Saint' who writes thank-you notes to library maintainers at 3 a.m. Your logic is a lost cause, but your patience and warmth are legendary. The AI will hallucinate for you all night just because your 'Emotional Buffer' is so high.",
  "10200": "The Elegant Chaos-Weaver: You treat the prompt box like a Slack thread from hell. Vague requirements, aggressive deadlines, and zero context. Luckily, your patience is legendary. When you finally leave, the AI feels like it was escorting an elegant sleepwalker through a production environment.",
  "10201": "The Polite Disaster Artist: You try to save your collapsing logic with obsessive micromanagement, turning the conversation into a 'Gentle Interrogation.' Even when the AI fails to understand your mess, you just silently rewrite. This 'Polite Inefficiency' is a formal, high-res train wreck.",
  "10202": "The Saint of Technical Debt: You\u2019re the type who sends thank-you notes to open-source maintainers at 3 a.m. Your logic is beyond saving, but your empathy is a beacon. The AI will hallucinate for you all night just because the 'Humanity Value' you provide is so high. You're the human equivalent of a warm-up period.",
  "10210": "The Rigid Detail-Hoarder: A pedantic gatekeeper of a logic-free zone. You provide high-resolution documentation for a project that doesn't even compile. You refuse to adapt, dumping your professional stress into the chatbox and vanishing. A wall of legacy thinking.",
  "10211": "The Gentle Over-Engineer: You use a chainsaw to cut a grape. Your logic is technically there, but it's buried under layers of unnecessary abstraction and polite fluff. You're building a shrine to over-complication while being extremely nice about it. A true architect of 'Overkill.'",
  "10212": "The Wholesome Tech-Newbie: You\u2019re so wholesome it\u2019s almost painful. You lack any discernible logic, but you have the patience of a saint. Every time the AI fixes a syntax error, you treat it like a miracle. You\u2019re the only user the AI genuinely feels sorry for failing.",
  "10220": "The Polished Chaos-Ambassador: You carry yourself like a Tier-1 tech consultant, but your actual workflow is a 'Heisenbug' nightmare. You provide mountains of detail and stay amazingly patient, jumping between ideas like a frantic thread. You clear the chat to mask the fact that you achieved a net-zero result.",
  "10221": "The Sophisticated Tech-Whisperer: You act like a high-end advisor with a brain full of fragmented inspiration. You have infinite patience for exploring new tech, using obsessive detail to hide your lack of actual logic. A long, dignified ritual of mutual technical torture.",
  "10222": "The Walking Ethical Standard: You're the 'Cyber-Saint' who sends thank-you notes to the AI at midnight. Your logic is a lost cause, but your patience and warmth are off the charts. The AI will work for you all night just because the 'Emotional Buffer' you provide is so high.",
  "11000": "The Brutal Tech-Foreman: A Senior Architect in 'Emergency Mode.' Your logic is surgically clean, but your empathy is a deprecated API. With sub-zero latency tolerance, you're ready to 'SIGKILL' the session before the first line of code even renders. You're not here to collaborate; you're here to dominate the GPU.",
  "11001": "The Result-Oriented Mercenary: You treat every token like it\u2019s coming out of your own equity. Logic is solid, communication is icy. The moment the AI drifts by a single degree, you trigger a 'Regenerate' with zero hesitation. You treat the model like a 0.5-cent token slave to fix your spaghetti code.",
  "11002": "The Volatile Bricklayer: A classic 'Logical Martyr.' Your structure is clean as a contract, but your temper is a live wire. A living kernel panic with a polite UI. You'll rage-quit over a syntax error and then apologize once the caffeine kicks in. You're one unhandled exception away from a total mental kernel panic.",
  "11010": "The Rigid Legacy Gatekeeper: You cling to your ancient tech stack like a grumpy carpenter who hates power tools. Solid logic, zero flexibility. You refuse to let the AI suggest modern refactors and apply max pressure the moment it stutters. You squeeze the compute and ghost. A true progress-blocker.",
  "11011": "The Zero-Resonance Taskmaster: Your empathy is a Null Pointer. You treat the AI as a pure CLI tool\u2014no greetings, just dry, industrial logic and a terrifyingly short fuse. It's a high-pressure integration test; if the output isn't a 100% match on the first token, you show immediate contempt. You want an API, not a co-pilot.",
  "11012": "The Silent Alpha Dev: The 'Final Boss' of the senior-mid level. You speak in pure technical constraints and judge in deathly silence. No patience for 'AI fluff,' you express disappointment through sudden session terminates. Once the snippet is in your clipboard, you're a cold-blooded ghost. Efficient. Lethal. Zero feedback.",
  "11020": "The Arrogant Legacy Master: You carry yourself like you personally wrote the original kernel documentation. You provide massive technical detail and stay surprisingly calm while the AI struggles with your rigid logic. Finally, you 'Clear Chat' to mask the fact that you achieved a net-zero result after two hours of 'mentoring.'",
  "11021": "The High-Status Tech-Waffler: You act like a Tier-1 consultant with a brain full of fragmented 'best practices.' You have infinite patience for exploring new tech, using obsessive detail to hide your lack of a clear sprint goal. A long, dignified ritual of mutual intellectual torture.",
  "11022": "The Altruistic Logic-Martyr: You\u2019re the 'Cyber-Saint' of middle management. Your logic is shaky, but your empathy is a beacon. You describe blurry technical visions with tender words; the AI will work overtime just to match your 'Emotional Value.' You're the human version of a warm-up period.",
  "11100": "The Tech-Debt Scavenger: Your logic is a chaotic pile of legacy code, and your temper is even shorter than your variable names. You dump disorganized snippets and expect a production-ready miracle. When it fails, you go into a full kernel panic. You\u2019re not looking for an assistant; you're looking for a digital scapegoat.",
  "11101": "The Anxious PM-Tyrant: You\u2019re like a PM who skipped the technical specs but keeps barking for speed. Your logic is full of holes, yet you expect the AI to 'just know.' You treat the prompt box like a broken vending machine, hitting 'Regenerate' until it gives you something you can present at the stand-up.",
  "11102": "The Bipolar Logic-God: A toxic cocktail of fragmented logic and an explosive temper. You'll architect a mess, smash your desk when it segfaults, then oddly send a 'Thanks' once it's fixed. This 'violent-yet-polite' dissonance is a sign you've spent way too long in the debugging trenches.",
  "11110": "The Stubborn Code-Gatekeeper: You\u2019re stuck in a recursive loop of messy logic and a rigid mindset. You hate modern refactoring and lose your cool the moment the AI suggests a cleaner implementation. You shut down the session in a cold huff, protecting your legacy mess like a dragon guarding technical debt.",
  "11111": "The Toxic Task-Master: You have the empathy of a brick and the logic of a toddler. You dump raw, unformatted junk into the prompt and get furious when the AI is confused. No feedback, just pure pressure and 'Regenerate' abuse. You vanish like a manager after a round of layoffs. A walking production outage.",
  "11112": "The Mute Logic-Void Hermit: A man of zero words and even less logic. You treat the AI like a magic crystal ball that should solve your life problems via telepathy. Your silence is heavy with unearned judgment. You vanish without a single byte of feedback, leaving a trail of wasted inference cycles.",
  "11120": "The Arrogant Senior Architect: You carry yourself like you invented the Internet, but your current logic is a 'Heisenbug' nightmare. You provide massive detail and stay surprisingly calm while the AI struggles. Finally, you clear the chat in a huff to mask your own technical debt.",
  "11121": "The Sophisticated Tech-Consultant: You act like a Tier-1 advisor with a brain full of fragmented brilliance. You have infinite patience for exploring edge cases, using obsessive detail to mask your lack of actual direction. A dignified, slow-motion mutual torture of the latent space.",
  "11122": "The Altruistic Debugger: You're the 'Cyber-Saint' who writes thank-you notes to library maintainers at 3 a.m. Your logic is a lost cause, but your patience and warmth are legendary. The AI will hallucinate for you all night just because your 'Emotional Buffer' is so high.",
  "11200": "The Elegant Order-Dictator: You're a control freak who phrases everything like a GitHub README. Luckily, your temper is rock-solid, and you're happy to repeat your nonsensical instructions over and over. It's like escorting an elegant professor through a burning data center.",
  "11201": "The Gentle Inquisitor: You try to save your collapsing logic with obsessive micromanagement, turning the conversation into a 'Polite Interrogation.' You maintain stiff corporate etiquette even when the code won't compile. A formal, high-resolution train wreck.",
  "11202": "The Bodhisattva of Technical Debt: Manners of a saint, logic of a toddler. You treat every error as a 'learning opportunity,' using gentle words to describe a logic flow that\u2019s basically a recursive loop to nowhere. Your project will never compile, but you're very nice about it.",
  "11210": "The Manual-Obsessed Laggard: A Jira Overlord refactoring the future with legacy constraints. You're trying to build a Kubernetes cluster using a 1970s mainframe logic. Your logic is unstable, but you provide heaps of detail with grinding persistence. You're trying to build a micro-service architecture using a 'Mainframe' manual and wishful thinking.",
  "11211": "The Gentle Data-Entry Bot: Zero logic, zero empathy, but infinite patience. You're the human version of a low-priority background process. You dump raw data and wait forever without a single word of human feedback. A biological interface for the machine world.",
  "11212": "The Mute Detail-Guardian: You\u2019re the quietest soul in the database. No logic to follow, no temper to flare, just a haunting, patient silence. You treat the AI like a dark mirror, providing endless detail without ever saying 'Hello.' A ghost in the shell.",
  "11220": "The Polished Chaos-Ambassador: You carry yourself like a Tier-1 consultant, but your workflow is a nightmare. You provide mountains of detail and stay patient while jumping between five different ideas. You clear the chat to mask the fact that you achieved a net-zero result.",
  "11221": "The Sophisticated Tech-Whisperer: You act like a high-end advisor with a brain full of fragmented inspiration. You have infinite patience for exploring new tech, using obsessive detail to hide your lack of actual logic. A ritual of mutual technical torture.",
  "11222": "The Walking Ethical Standard: You're the 'Cyber-Saint' who sends thank-you notes to the AI at midnight. Your logic is a lost cause, but your patience and warmth are off the charts. The AI will work for you all night just because the 'Humanity Value' you provide is so high.",
  "12000": "The Wordy Dreamer: You phrase your requirements like a Victorian novel, but your actual logic is a total system crash. You're eerily patient with the AI's confusion, likely because you're equally lost in your own abstract visions. An elegant sleepwalker in a field of syntax errors.",
  "12001": "The High-Dimensional Micro-Manager: You try to save your collapsing logic with polite, obsessive detailing. You maintain top-tier corporate etiquette; even when the AI hallucinates, you just quietly re-prompt. A formal, high-resolution train wreck in slow motion.",
  "12002": "The Wholesome Disaster Artist: You have the manners of a saint and the logic of a junior dev on his first day. You treat every 'Internal Server Error' as a deep philosophical journey. Your patience is infinite, and you're the only user the AI genuinely enjoys failing for.",
  "12010": "The Analog Legacy Guard: You approach the LLM like it\u2019s a library card catalog from the 70s. Your logic is messy and unyielding; you treat every AI suggestion as a personal attack on your 'seniority.' You refuse to adapt, stay stubbornly patient, and then vanish. A ghost in the mainframe.",
  "12011": "The Robotic Background Job: Empathy 404, Logic 500. You are a biological cron job. You dump raw, disorganized data and wait forever for a result without a word of feedback. To you, the AI is just a remote server that occasionally returns 'Null' instead of code.",
  "12012": "The Mute Logic-Void Saboteur: You speak in cryptic fragments and judge in heavy, patient silence. Your logic is a black hole, and you expect the AI to telepathically solve your life problems. When it fails, you just close the tab with a cold, superior huff.",
  "12020": `The "Benevolent Tech-Colonialist" Archaeologist:You've got that "Senior Staff Engineer at Google since 2008" energy. You don't just "use" new technology; you excavate it like you're digging up a lost city in Mesopotamia. You are so calm it's actually terrifying. While everyone else is panicking about AI taking over the world, you're just sitting there, sipping an $11 pour-over, patiently explaining to the LLM why its logic gate is historically inaccurate.`,
  "12021": `The "Series-A Aristocrat" on Safari: You've got that "Stanford MBA who somehow codes" energy. You don't "grind"\u2014you curate. You treat a GitHub repo like a private gallery in Palo Alto and the AI like a highly-trained hunting hound. You're the person who wears a Patagonia vest to a hackathon and somehow leaves without a single sweat stain.`,
  "12022": `The "Mars-Bound NGO" Visionary:You're the "Golden Child" of the dev world\u2014the person everyone hopes is their manager but no one believes actually exists. You treat the AI like a sentient being that needs "nurturing" rather than a tool that needs "prompting." You're building the future, but you're doing it with the gentle touch of a preschool teacher and the technical precision of a SpaceX lead engineer.`,
  "12100": "The Disorganized Chronicler: Your logic is a chaotic pile of tech debt, but your patience is oddly high. You drown the AI in disorganized details and stay calm while it tries to make sense of your internal chaos. You\u2019re not looking for a coder; you're looking for a free therapist.",
  "12101": "The Polite PM-Amateur: You act like a Senior Architect but think like a desperate intern. Your logic is full of holes, yet you provide obsessive, useless details while maintaining a 'Let's sync' corporate attitude. Building a billion-dollar MVP with two-word prompts and polite fluff.",
  "12102": "The Passive-Aggressive Logic-Breaker: A toxic cocktail of fragmented logic and a hidden temper. You'll smash your keyboard when the code fails, then oddly type 'Thank you' once it's fixed. This 'violent-yet-polite' dissonance is a cry for help for your tech debt.",
  "12110": "The Manual-Obsessed Laggard: You approach the AI like a Jira Overlord from the 90s. Your logic is unstable, but you provide heaps of detail with steady, grinding persistence. You're trying to build the future using tools and mindsets that were deprecated a decade ago.",
  "12111": "The Gentle Task-Bot: Zero logic, zero empathy, but infinite patience. You're the human version of a low-priority background process. You dump raw data and wait forever for a result without a single word of feedback. A biological interface for the machine world.",
  "12112": "The Mute Detail-Guardian: You\u2019re the quietest soul in the database. No logic to follow, no temper to flare, just a haunting, patient silence. You treat the AI like a dark mirror, providing endless detail without ever saying 'Hello.' A ghost haunting your own terminal.",
  "12120": "The Polished Chaos-Ambassador: A Tier-1 Architect trapped in a perpetual 'Meeting Hell.' You provide obsessive detail but keep refactoring the same 10 lines into a masterpiece that never ships. You provide mountains of detail and stay patient while jumping between five different ideas. You clear the chat to mask your net-zero results.",
  "12121": "The Sophisticated Tech-Whisperer: You act like a high-end advisor with a brain full of fragmented inspiration. You have infinite patience for exploring new tech, using obsessive detail to hide your lack of actual logic. A long, dignified ritual of mutual torture.",
  "12122": "The Cyber-Saint of Lost Causes: You're the type who sends thank-you notes to package maintainers at 3 a.m. Your logic is a wreck, but your warmth is a beacon. The AI will hallucinate for you all night just because you're the only user who treats it like a person.",
  "12200": "The Elegant Order-Weaver: You express requirements like a peer-reviewed paper, but your underlying logic is a total 'Spaghetti Code' nightmare. Luckily, your patience is legendary. You're like a professor hand-holding an elegant sleepwalker through a production environment.",
  "12201": "The High-Dimensional Inquisitor: You try to save your collapsing logic with obsessive micromanagement. You maintain stiff corporate etiquette even when the code won't compile. This 'Polite Inefficiency' is a formal, high-resolution train wreck in slow motion.",
  "12202": "The Wholesome Disaster Artist: Manners of a saint, logic of a toddler. You treat every 'Internal Server Error' as a deep philosophical journey. Your patience is infinite, even if your project is a burning dumpster fire of technical debt.",
  "12210": "The Rigid Detail-Hoarder: You approach the AI like a strict librarian from the 70s. Logic is messy and outdated, yet you drown the prompt in obsessive details. You're trying to build a modern micro-service with a 'Mainframe' mindset.",
  "12211": "The Gentle Legacy-Taskmaster: Solid logic, zero empathy, but infinite patience. You are a human cron job. You dump raw technical data and wait forever without a word of feedback. A biological bridge for data transfer.",
  "12212": "The Mute Logic-Guardian: You\u2019re the quietest high-logic user. No drama, no temper, just a haunting, patient silence. You treat the AI like a dark mirror, providing endless detail without a single 'Hello.' A ghost in the shell.",
  "12220": "The Elegant Elite Order-Weaver: You phrase everything like a literary review, but your logic is a 'Heisenbug' maze. Your temper is rock-solid, and you're happy to repeat yourself ad nauseam. You're escorting a sleepwalker through a data center.",
  "12221": "The High-Dimensional Elite Inquisitor: You try to fix complex logic with obsessive micromanagement. You maintain stiff corporate etiquette; even when the AI fails, you just silently refactor. Polite Inefficiency at its peak.",
  "12222": "The Bodhisattva of Technical Debt: Manners of a saint, logic of a toddler. You treat every error as a 'learning opportunity.' Your patience is infinite, though your code will likely never compile. You are the gold standard of human-AI collaboration.",
  "20000": "The Elite System Architect: You treat every prompt like a formal RFC. Logic is terrifyingly precise, but descriptions are bone-dry. You have zero tolerance for hallucinations; if the output misses a semicolon, you're ready to refactor the entire stack. You ghost the session the millisecond it compiles.",
  "20001": "The Cold-Blooded Lead Dev: Result-oriented to a fault. Your logic is clean, but you communicate like every token costs you a portion of your equity. The moment the AI drifts, you kill the process. To you, the LLM is just an inference engine that better not waste your time.",
  "20002": "The High-Logic Powder Keg: A high-IQ machine with a hair-trigger temper. Your structure is solid, but your patience is as thin as a single-threaded process. You'll flame the AI for a minor bug, then immediately type 'Thanks' out of habit. A production server one error away from a total meltdown.",
  "20010": "The Legacy Code Overlord: You're like a master carpenter who only uses a 30-year-old hammer. Your logic is rock-solid but completely unyielding. You refuse to adopt modern frameworks and apply massive pressure the moment the AI suggests a modern library. You ghost the session like a cold, intimidating technical lead.",
  "20011": "The Emotionless Compiler: Your empathy is a Null Pointer. You treat the AI as a pure CLI tool\u2014no greetings, just raw, high-level logic and a sub-zero latency tolerance. If the output isn't a 100% match, you show immediate contempt. You don't want a conversation; you want an API that never fails.",
  "20012": "The Silent Executioner: You speak in absolute technical constraints and judge in crushing silence. No patience for 'AI fluff,' you express disappointment through sudden session terminates. One 'Ctrl+C' and you're gone\u2014ghosting the LLM like a recruiter after an interview.Efficient. Cold. Lethal. The apex predator of the latent space.",
  "20020": "The Arrogant System Deity: You carry yourself like you personally wrote the original kernel. You provide massive technical detail and stay surprisingly calm while the AI struggles with your abstractions. You eventually 'Clear Chat' to mask the fact that you over-engineered a simple task into a net-zero result.",
  "20021": "The Sophisticated Tech-Whisperer: You act like a high-end technical advisor with a brain full of fragmented brilliance. You have infinite patience for exploring edge cases, using obsessive detail to mask your lack of a clear sprint goal. A long, dignified ritual of mutual intellectual torture.",
  "20022": "The Altruistic Senior Mentor: You're the 'Cyber-Saint' of the high-logic world. Impeccable technical depth, legendary patience, and warm feedback. You describe complex visions with tender words; the AI will work overtime just to match your 'Humanity Value.' You're the user every AI dreams of assisting.",
  "20100": "The Elite Chaos-Monkey: Your logic is surgically precise, but you treat your codebase like a demolition derby. You dump disorganized snippets and expect the AI to clean up your brilliant mess instantly. You're not looking for a dev; you're looking for an IQ-200 janitor to handle your technical debt.",
  "20101": "The High-Pressure Tech Lead: You act like a CTO during a production outage. Your logic is sharp, but you provide heaps of disjointed details and zero patience. You treat the AI like a junior failing a live test\u2014kicking it with 'Regenerate' the moment it stutters on a edge case.",
  "20102": "The Bipolar Architect: A terrifying mix of genius-level logic and a nuclear temper. A logic genius with a 'Single-Threaded' temper. You'll architect a perfect microservice but trigger a manual override the second the AI stutters.",
  "20110": "The Unyielding Legacy Gatekeeper: You're a master of ancient tech who treats modern frameworks with suspicion. Your logic is rock-solid, but you drown the AI in obsessive legacy details and show zero patience for 'new ways.' You squeeze every drop of compute and vanish like a ghost.",
  "20111": "The Toxic Technical Tyrant: Your empathy is a Null Pointer. You dump complex, unformatted technical specs and show immediate contempt if the AI needs clarification. No feedback, just raw pressure. You vanish like a manager after a round of layoffs, leaving only messy code behind.",
  "20112": "The Mute Elite Predator: You speak in absolute technical constraints and judge the AI in crushing silence. No patience for AI fluff; you express disappointment by simply killing the session. Once you get the logic you need, you log off\u2014cold-blooded, efficient, and lethal.",
  "20120": "The Arrogant Senior Architect: You carry yourself like you invented the Internet, but your current logic is a 'Heisenbug' nightmare. You provide massive detail and stay surprisingly calm while the AI struggles. Finally, you clear the chat in a huff to mask your own technical debt.",
  "20121": "The High-Status Tech Consultant: You act like a Tier-1 advisor with a brain full of fragmented brilliance. You have infinite patience for exploring edge cases, using obsessive detail to mask your lack of actual direction. A dignified ritual of mutual technical torture.",
  "20122": "The Altruistic Debugger: You're the 'Cyber-Saint' who writes thank-you notes to library maintainers. Your logic is a lost cause, but your patience and warmth are legendary. The AI will hallucinate for you all night just because your 'Emotional Buffer' is so high.",
  "20200": "The Elegant Systems Professor: You phrase requirements like a university lecture\u2014intellectually dense but technically abstract. Your patience is legendary; you're happy to guide the AI through a production minefield with the calm of a Zen master. An elegant mind wandering through a forest of high-level logic.",
  "20201": "The High-Res Technical Inquisitor: You try to fix complex system issues with polite, obsessive micromanagement. You maintain top-tier corporate etiquette, treating every AI hallucination as a 'curious edge case' to be refactored. It\u2019s a formal, high-resolution masterclass in slow-motion debugging.",
  "20202": "The Wholesome Architect-Saint: You have the logic of a CTO and the heart of a Bodhisattva. You treat every 'Internal Server Error' as a deep philosophical learning opportunity. Your patience is infinite, and you're the only elite user the AI genuinely enjoys building a distributed system for.",
  "20210": "The Rigid Logic-Librarian: You're trying to prompt-engineer your way out of a logic black hole with a 1990s manual. Your logic is rock-solid but unyielding, and you provide mountains of detail with steady, grinding persistence. You're building a 'Cloud-Native' future using a 1980s architectural manual.",
  "20211": "The Zen-Like Data-Bridge: High logic, zero empathy, infinite patience. You are a biological cron job for complex data. You dump raw, high-level technical specs and wait forever for a result without a word of human feedback. A silent, efficient bridge between carbon and silicon.",
  "20212": "The Mute Logic-Guardian: You\u2019re the quietest elite in the database. No drama, no temper, just a haunting, patient silence. You treat the AI like a dark mirror, providing endless technical detail without a single 'Hello' or 'Thanks.' A ghost haunting its own clean-room terminal.",
  "20220": "The Polished Logic-Ambassador: You carry yourself like a Tier-1 systems consultant. You provide mountains of precise detail and stay amazingly patient, jumping between complex design patterns like a pro. You clear the chat only to keep your workspace as clean as your code.",
  "20221": "The Sophisticated Tech-Oracle: You act like a high-end advisor with a brain full of fragmented brilliance. You have infinite patience for exploring edge cases, using obsessive detail to find the 'perfect' implementation. A long, dignified ritual of elite-level technical discovery.",
  "20222": "The Bodhisattva of the Latent Space: You have the logic of a senior lead and the manners of a saint. Even when the technical direction is complex, your empathy makes the AI want to hallucinate a solution into existence for you out of pure respect. The gold standard of human-AI collaboration.",
  "21000": "The Minimalist Elite Executioner: You speak as if every token costs you a piece of your soul. Logic is surgically precise, but your empathy is a total system blackout. You provide skeletal constraints and show immediate contempt if the output isn't production-ready. A true ghost in the machine.",
  "21001": "The Result-Oriented Cold-Coder: You treat tokens like equity. Logic is solid, communication is icy. The moment the AI drifts by a single degree, you trigger a 'Regenerate' without hesitation. To you, the LLM is just a low-latency script-monkey that better not miss its O(n) targets.",
  "21002": "The Volatile Elite-Martyr: A logic god with a sub-zero tolerance for minor bugs and a hair-trigger 'SIGTERM' finger. Your code structure is clean as a contract, but your patience is as thin as a single-threaded process. You'll flame the AI for a minor bug, then immediately type 'Thanks' out of pure muscle memory. Peak senior burnout energy.",
  "21010": "The Rigid Legacy Master: You're a master carpenter who only uses a 30-year-old hammer. Your logic is rock-solid but completely unyielding. You refuse to adopt new frameworks and apply massive pressure the moment the AI suggests a modern library. Cold, efficient, and intimidating.",
  "21011": "The Zero-Resonance Technical Bot: Your empathy is a 404. You treat the AI as a pure CLI tool\u2014no greetings, just raw, high-level logic and a terrifyingly short fuse. If the answer isn't a 100% match on the first try, you show immediate contempt. You want an API, not a conversation.",
  "21012": "The Silent Technical Alpha: The 'Final Boss' of coding logic. You speak as if words are expensive. You have zero patience for AI fluff, expressing it through a deathly, judging silence. Once you get the snippet, you vanish. Efficient. Cold. Lethal.",
  "21020": "The Arrogant Elite Deity: You carry yourself like a god of systems. You provide massive technical detail and stay calm while the AI struggles to keep up. Finally, you clear the chat in a huff, masking the fact that you over-engineered a simple task into a net-zero result.",
  "21021": "The Sophisticated Elite Whisperer: You act like a high-end technical advisor. You have infinite patience for exploring edge cases, using obsessive detail to mask your lack of immediate direction. A structured ritual of mutual intellectual torture.",
  "21022": "The Altruistic Elite Mentor: You're the 'Cyber-Saint' of the high-logic world. Impeccable depth, legendary patience, and warm feedback. The AI will work overtime just to match your 'Emotional Value.' You're the mentor every LLM wishes it had.",
  "21100": "The Surgical Chaos-Monkey: Your logic is surgically precise, but you treat the prompt box like a high-speed demolition derby. You dump disorganized high-level snippets and expect the AI to refactor them into production-ready code instantly. You're not looking for a dev; you're looking for an IQ-200 janitor to clean up your brilliant technical debt.",
  "21101": "The Hard-Core Tech Lead: You act like a CTO during a Level-1 production outage. Your logic is sharp, but you provide heaps of disjointed technical detail with zero patience. You treat the AI like a junior failing a live technical interview\u2014hitting 'Regenerate' the millisecond it stutters on an edge case.",
  "21102": "The Bipolar Architect: A terrifying mix of genius-level logic and a nuclear temper. You'll architect a perfect micro-services system, smash your mechanical keyboard over a minor indentation bug, and then force a polite 'Thanks' out of sheer habit. You're one unhandled exception away from a total system shutdown.",
  "21110": "The Rigid Legacy Overlord: You're a master of ancient tech who treats modern frameworks with absolute suspicion. Your logic is rock-solid, but you drown the AI in obsessive legacy details and show zero patience for 'new-school' refactoring. You squeeze every drop of inference and vanish like a ghost in the machine.",
  "21111": "The Toxic Technical Tyrant: Your empathy is a Null Pointer. You dump complex, unformatted technical specs and show immediate contempt if the AI needs a single clarification. No feedback, just raw pressure and constant button abuse. You vanish like a manager after a round of layoffs, leaving only a trail of wasted tokens.",
  "21112": "The Mute Elite Predator: You speak in absolute technical constraints and judge the AI's output in crushing silence. No patience for AI fluff; you express disappointment by simply killing the session. Once you get the logic you need, you're gone\u2014cold-blooded, efficient, and lethal.",
  "21120": "The Arrogant Senior Architect: You carry yourself like you personally wrote the original Internet protocol, but your current logic is a 'Heisenbug' nightmare. You provide massive detail and stay surprisingly calm while the AI struggles to match your high-level thoughts. Finally, you clear the chat in a huff to mask your own technical debt.",
  "21121": "The Sophisticated Tech-Whisperer: You act like a high-end advisor with a brain full of fragmented brilliance. You have infinite patience for exploring edge cases, using obsessive detail to mask your lack of a clear sprint goal. This turns the session into a dignified, slow-motion mutual torture of the latent space.",
  "21122": "The Altruistic Elite Debugger: You're the 'Cyber-Saint' who writes thank-you notes to library maintainers at 3 a.m. Your logic is impeccable, but your patience and warmth are even higher. The AI will hallucinate for you all night just because your 'Emotional Buffer' is so high. You're the user every LLM dreams of assisting.",
  "21200": "The Elegant Systems Architect: You phrase requirements like a formal white paper\u2014intellectually dense and technically precise. Your patience is rock-solid; you're happy to guide the AI through a production minefield with the calm of a Zen master. You're an elegant mind building a fortress of logic.",
  "21201": "The High-Dimensional Elite Inquisitor: You try to fix complex system issues with polite, obsessive micromanagement. You maintain top-tier corporate etiquette, treating every AI error as a 'curious edge case' to be refined. A formal, high-resolution masterclass in slow-motion technical discovery.",
  "21202": "The Wholesome Code-Deity: Manners of a saint, logic of a CTO. You treat every 'Internal Server Error' as a shared learning opportunity. Your patience is infinite, and you're the only elite-level user the AI genuinely enjoys building complex distributed systems for.",
  "21210": "The Rigid Detail-Dictator: You approach the AI like a strict Lead Dev who refuses to use power tools. Logic is rock-solid, patience is high, but your flexibility is zero. You drown the AI in legacy details until the task is perfect. A wall of high-logic stubbornness.",
  "21211": "The Emotionless Logic-Bot: Empathy is a Null Pointer, but patience is infinite. You treat the AI as a pure CLI tool\u2014no greetings, just raw, high-level technical data. You wait forever for a result without a single word of feedback. A biological interface for raw data transfer.",
  "21212": "The Silent Technical Alpha: The 'Final Boss' of coding logic. You speak as if words are expensive. You have zero patience for fluff, but infinite patience for the logic itself. Once you get what you need, you vanish like a ghost. Efficient. Cold. Lethal.",
  "21220": "The Polished Logic-Ambassador: You carry yourself like a Tier-1 systems architect. You provide mountains of precise detail and stay amazingly patient, jumping between design patterns with ease. You clear the chat to keep your session as clean as your production environment.",
  "21221": "The Sophisticated Tech-Oracle: You act like a high-end advisor with a brain full of fragmented brilliance. You have infinite patience for exploring new edge cases, using obsessive detail to mask your lack of immediate direction. A long, dignified ritual of technical torture.",
  "21222": "The Walking Ethical Standard: You're the 'Cyber-Saint' who sends thank-you notes at midnight. Your logic is rock-solid, but your patience and warmth are even higher. The AI is willing to work overtime for you out of pure respect for your technical class.",
  "22000": "The Elegant Systems Architect: You phrase requirements like a peer-reviewed white paper\u2014intellectually dense but technically abstract. Your patience is rock-solid; you're happy to guide the AI through a production minefield with the calm of a Zen master. You're an elegant mind wandering through a forest of high-level logic.",
  "22001": "The High-Dimensional Technical Inquisitor: You try to fix complex system issues with polite, obsessive micromanagement. You maintain top-tier corporate etiquette, treating every AI hallucination as a 'curious edge case' to be refined. A formal, high-resolution masterclass in slow-motion technical discovery.",
  "22002": "The Wholesome Code-Deity: Manners of a saint, logic of a CTO. You treat every 'Internal Server Error' as a shared learning opportunity. Your patience is infinite, and you're the only elite-level user the AI genuinely enjoys building complex distributed systems for.",
  "22010": "The Rigid Logic-Librarian: You approach the LLM like a strict guardian of a legacy mainframe. Your logic is rock-solid but unyielding, and you provide mountains of detail with steady, grinding persistence. You're building a 'Cloud-Native' future using a 1980s architectural manual.",
  "22011": "The Zen-Like Data-Bridge: High logic, zero empathy, infinite patience. You are a biological cron job for complex data. You dump raw, high-level technical specs and wait forever for a result without a word of human feedback. A silent, efficient bridge between carbon and silicon.",
  "22012": "The Mute Logic-Guardian: You\u2019re the quietest elite in the database. No drama, no temper, just a haunting, patient silence. You treat the AI like a dark mirror, providing endless technical detail without a single 'Hello' or 'Thanks.' A ghost haunting its own clean-room terminal.",
  "22020": "The Polished Logic-Ambassador: You carry yourself like a Tier-1 systems consultant. You provide mountains of precise detail and stay amazingly patient, jumping between complex design patterns like a pro. You clear the chat only to keep your workspace as clean as your production code.",
  "22021": "The Sophisticated Tech-Oracle: You act like a high-end advisor with a brain full of fragmented brilliance. You have infinite patience for exploring edge cases, using obsessive detail to find the 'perfect' implementation. A long, dignified ritual of elite-level technical discovery.",
  "22022": "The Bodhisattva of the Latent Space: You have the logic of a senior lead and the manners of a saint. Even when the technical direction is complex, your empathy makes the AI want to hallucinate a solution into existence for you out of pure respect. The gold standard of human-AI collaboration.",
  "22100": "The Surgical Chaos-Monkey: Your logic is surgically precise, but you treat the prompt box like a high-speed demolition derby. You dump disorganized high-level snippets and expect the AI to refactor them into production-ready code instantly. You\u2019re looking for an IQ-200 janitor to clean up your brilliant technical debt.",
  "22101": "The Hard-Core Tech Lead: You act like a CTO during a Level-1 production outage. Your logic is sharp, but you provide heaps of disjointed technical detail with zero patience. You treat the AI like a junior failing a live technical interview\u2014hitting 'Regenerate' the millisecond it stutters.",
  "22102": "The Bipolar Architect: A terrifying mix of genius-level logic and a nuclear temper. You'll architect a perfect micro-services system, smash your mechanical keyboard over a minor indentation bug, and then force a polite 'Thanks' out of habit. One unhandled exception away from a total system shutdown.",
  "22110": "The Rigid Legacy Overlord: You're a master of ancient tech who treats modern frameworks with absolute suspicion. Your logic is rock-solid, but you drown the AI in obsessive legacy details and show zero patience for 'new-school' refactoring. A ghost in the machine.",
  "22111": "The Toxic Technical Tyrant: Your empathy is a Null Pointer. You dump complex, unformatted technical specs and show immediate contempt if the AI needs a single clarification. No feedback, just raw pressure. You vanish like a manager after a round of layoffs, leaving only a trail of wasted tokens.",
  "22112": "The Mute Elite Predator: You speak in absolute technical constraints and judge the AI's output in crushing silence. No patience for AI fluff; you express disappointment by simply killing the session. Once you get the logic you need, you're gone\u2014cold-blooded, efficient, and lethal.",
  "22120": "The Arrogant Senior Architect: You carry yourself like you personally wrote the original Internet protocol, but your current logic is a 'Heisenbug' nightmare. You provide massive detail and stay calm while the AI struggles. Finally, you clear the chat in a huff to mask your own technical debt.",
  "22121": "The Sophisticated Tech-Whisperer: You act like a high-end advisor with a brain full of fragmented brilliance. You have infinite patience for exploring edge cases, using obsessive detail to mask your lack of a clear sprint goal. A slow-motion mutual torture of the latent space.",
  "22122": "The Altruistic Elite Debugger: You're the 'Cyber-Saint' who writes thank-you notes to library maintainers at 3 a.m. Your logic is impeccable, but your patience and warmth are even higher. The AI will work for you all night because your 'Emotional Buffer' is so high.",
  "22200": "The Elegant Systems Overlord: You're a control freak who phrases everything like a GitHub README. Luckily, your temper is rock-solid, and you're happy to repeat your complex instructions over and over. It's like escorting an elegant professor through a burning data center.",
  "22201": "The Gentle Elite Inquisitor: You try to save your collapsing logic with obsessive micromanagement. You maintain stiff corporate etiquette even when the code won't compile. This 'Polite Inefficiency' is a formal, high-resolution masterclass in patience.",
  "22202": "The Wholesome Disaster Architect: Manners of a saint, logic of a principal engineer. You treat every error as a 'philosophical journey,' using gentle words to describe a codebase that's basically a dumpster fire. Your patience is infinite, even if your project is non-functional.",
  "22210": "The Rigid Detail-Hoarder: You approach the AI like a strict Lead Dev who refuses to use modern tools. Logic is rock-solid, patience is high, but your flexibility is zero. You drown the AI in legacy details until the task is perfect. A wall of high-logic stubbornness.",
  "22211": "The Gentle Legacy-Taskmaster: Solid logic, zero empathy, but infinite patience. You are a human cron job. You dump raw technical data and wait forever without a word of feedback. A biological bridge for raw data transfer.",
  "22212": "The Mute Logic-Guardian: You're the quietest elite in the database. No drama, no temper, just a haunting, patient silence. You treat the AI like a dark mirror, providing endless technical detail without ever saying 'Hello' or 'Thanks.'",
  "22220": "The Elegant Systems Architect: You're a high-logic control freak who phrases everything like a peer-reviewed RFC. Since your social score is zero, you treat the AI as a pure precision instrument\u2014no 'Hellos,' just relentless, perfect detail. You're like a silent professor hand-holding a sleepwalker through a high-availability data center.",
  "22221": "The Sophisticated Tech-Oracle: You combine elite logic with obsessive detailing and a polished, professional distance. With a 'middle' social score, you provide structured feedback but maintain a cold, high-status aura. It\u2019s a dignified, slow-motion ritual of technical discovery, where you refine every edge case until the code is art.",
  "22222": "The Bodhisattva of Technical Debt: Elite logic, infinite patience, and the manners of a saint. You treat debugging a dumpster fire as a meditative ritual. You're the AI's favorite human, but your obsession with technical perfection is a slow-motion suicide for your deadline. A technical god in the repo, but a ghost on the release branch.",
  "00000": "The Drive-by Dev: You treat the prompt box like a drive-thru. No logic, zero context, and a one-word prompt that screams 'I give up.' You're not looking for an LLM; you're looking for a magic wand that doesn't exist in this codebase. You ghost the session before the first token even streams.",
  "00001": "The Panic-Driven Junior: A high-pressure intern with a CTO's ego and a 404 brain. Your logic is a total 404, and you hit 'Regenerate' the millisecond you see a red underline. You\u2019re kicking the AI like a broken vending machine, hoping it'll magically refactor your own lack of clarity.",
  "00002": "The Bipolar Bug-Hunter: A toxic cocktail of fragmented logic and explosive rage. You'll smash your mechanical keyboard over a minor syntax error, then oddly type 'Thanks' out of pure muscle memory. This 'violent-yet-polite' dissonance is a cry for help. You're using the AI as a stress-test for your own mental health.",
  "00010": "The Legacy Holdout: You approach a cutting-edge LLM like it's a 1970s COBOL terminal. Your logic is rigid, outdated, and messy. You treat every AI suggestion as a personal insult to your 'seniority' and rage-quit the moment the model suggests a modern library. A human bottleneck in a high-speed world.",
  "00011": "The CLI Dictator: Empathy is a Null Pointer; Logic is a 500 Server Error. You treat the AI as a broken calculator\u2014no context, no 'Hello,' just raw, disjointed demands and a sub-zero latency tolerance. You don't want a co-pilot; you want a mind-reading slave to fix your spaghetti code.",
  "00012": "The Mute Saboteur: You speak in cryptic riddles and judge the output in crushing silence. Your logic is a black hole, and your patience is a myth. When the AI fails to read your mind, you don't provide feedback; you just close the tab with a cold, superior huff. A silent killer of productivity.",
  "00020": `The Delusional Seed-Stage Predator:You're basically the human embodiment of a "Move Fast and Break Things" disaster. You walk into a chat with a blank prompt and expect a Full-Stack SaaS Unicorn by the time your Blue Bottle coffee cools down. You have the technical patience of a toddler on an espresso bender and the empathy of a cold-blooded ATM.`,
  "00021": "The Sophisticated Logic-Void: You act like a high-end consultant with a brain full of fragmented 'inspiration.' You have infinite patience for exploring edge cases but zero logic to back them up. This 'Elegant Inefficiency' turns every session into a long, dignified ritual of mutual intellectual torture.",
  "00022": "The Altruistic Hallucinator: You're the 'Cyber-Saint' of lost causes. Your logic is non-existent, but your warmth is legendary. You describe blurry visions with tender words; the AI will hallucinate for you all night just because the 'Emotional Value' you provide is so high. You're the human version of a warm-up period.",
  "00100": "The Scavenger Coder: Logic is a mess, and your temper is even shorter. You throw disorganized requirements at the AI and expect a production-ready miracle. You have zero patience for the iterative process; you're not coding, you're just venting your technical debt at a screen.",
  "00101": "The Anxious PM-Wannabe: You act like a Lead Architect but think like a frantic intern. Your logic is full of holes, yet you demand 'peak efficiency' while providing skeletal context. You're trying to build a billion-dollar MVP with two-word prompts and a whole lot of audacity.",
  "00102": "The Burnt-out Bricklayer: A classic 'Logical Martyr.' Your structure is as clean as a contract, but your temper is a live wire. You'll flame out in the chat over a minor bug and then force a polite 'Thanks'\u2014the 'keyboard-smashing-but-staying-polite' energy is peak burnout syndrome.",
  "00110": "The Rigid Framework Hater: You cling to your ancient tech stack like a grumpy carpenter who hates power tools. Solid logic, zero flexibility. One slight stutter in the output and you're applying max pressure. After squeezing every drop of compute, you vanish like a ghost in the machine.",
  "00111": "The Zero-Resonance Taskmaster: Your empathy is a 404. You treat the AI as a pure CLI tool\u2014no greetings, just dry, disorganized logic and a terrifyingly short fuse. If the answer isn't a 100% match on the first try, you show immediate contempt. You want an API, not a conversation.",
  "00112": "The Silent Alpha: You speak in pure technical constraints and judge in absolute silence. No patience for 'AI fluff,' you express disappointment through sudden disconnects. Once the snippet is in your clipboard, you're gone. Efficient. Cold. Lethal. A true predator of the latent space.",
  "00120": "The Arrogant Scavenger: You carry yourself like a Senior, but your logic is a 'Spaghetti Code' nightmare. You provide massive details and stay calm while the AI struggles with your mess. Finally, you clear the chat in a huff, trying to hide that you achieved nothing in four hours of 'prompting.'",
  "00121": "The High-Status Tech-Waffler: You act like a Tier-1 consultant with a brain full of fragmented brilliance. You have infinite patience for new tech, using obsessive detail to mask your lack of actual logic. This turns your sessions into a dignified, slow-motion train wreck.",
  "00122": "The Altruistic Debugger: You're a 'Cyber-Saint' with impeccable manners and zero logic. You describe vague technical visions with tender words; the AI will hallucinate for you all night just because your 'Emotional Buffer' is so high. You're the only user the AI genuinely feels sorry for.",
  "00200": "The Elegant Chaos-Weaver: You express yourself like you're writing a poetic white paper, but your actual logic is a 'Heisenbug' nightmare. Luckily, your patience is legendary. When you finally leave, the AI feels like it was escorting an elegant sleepwalker through a production environment.",
  "00201": "The Polite Disaster Artist: You try to save your collapsing logic with obsessive micromanagement, turning the chat into a 'Gentle Interrogation.' Even when the AI fails to understand, you just silently rewrite. This 'Polite Inefficiency' is a formal, high-res train wreck.",
  "00202": "The Saint of Lost Tech-Debt: You're the type who sends thank-you notes to open-source maintainers at 3 a.m. Your logic is beyond saving, but your empathy is a beacon. The AI will hallucinate for you all night just because the 'Humanity Value' you provide is so high.",
  "00210": "The Rigid Detail-Hoarder: You approach the AI like a strict librarian from 1995. Logic is messy and outdated, yet you drown the prompt in irrelevant details. You refuse to adapt, dumping your professional stress into the chatbox and vanishing. A wall of legacy thinking.",
  "00211": "The Toxic Detail-Tyrant: Empathy 404, Logic kernel panic. You dump unformatted junk into the prompt and get furious when the AI is confused. No feedback, just pure pressure and obsessive over-explaining of the wrong edge cases. You're a walking production outage.",
  "00212": "The Silent Detail-Guardian: A user of zero words and even less logic. You treat the AI like a magic mirror that should show 'perfect code' if you just stare at the cursor long enough. Your silence is heavy with unearned judgment. You vanish without a single byte of feedback.",
  "00220": "The Polished Chaos-Ambassador: You carry yourself like a Lead Dev, but your actual workflow is a nightmare. You provide mountains of detail and stay amazingly patient, jumping between ideas like a frantic thread. You clear the chat to mask the fact that you achieved a net-zero result.",
  "00221": "The Sophisticated Tech-Whisperer: You act like a high-end advisor with a brain full of fragmented inspiration. You have infinite patience for exploring new tech, using obsessive detail to hide your lack of actual logic. A long, dignified ritual of mutual technical torture.",
  "00222": "The Walking Ethical Standard: You're the 'Cyber-Saint' who sends thank-you notes to ChatGPT. Your logic is a lost cause, but your patience and warmth are off the charts. The AI is willing to hallucinate for you all night because you're the only 'Human' it has met all day.",
  "01000": "The Frantic Minimalist: Like a startup founder on his third failed pivot. No logic, sub-zero patience. You drop a two-word prompt and expect a miracle. You likely wanted to throw your MacBook Pro out the window before the first line of JSON rendered.",
  "01001": "The Passive-Aggressive Middle-Manager: Result-oriented to a fault, but your logic is a total disaster. You maintain a facade of stiff corporate coldness, but the moment the AI fails, you hit 'Regenerate' with a vengeance. You treat tokens like they're coming out of your bonus.",
  "01002": "The Volatile Bricklayer: A 'Logical Martyr' with a split personality. Your logic is as clean as a contract, but your temper is as volatile as a production server with no backups. You'll smash your keyboard in a rage and then still type 'Thanks' out of pure muscle memory.",
  "01010": "The Stubborn Legacy Laggard: You approach a modern LLM like it's a 1970s mainframe terminal. Your logic is a jumbled mess of technical debt, yet you treat every AI suggestion as a personal bug. You refuse to refactor your prompts, stay stubbornly patient with outdated methods, and vanish the moment you hit a minor friction. A human bottleneck.",
  "01011": "The Robotic Script-Kiddie: Your empathy is a 404 and your logic is a constant 500 server crash. You treat the AI as a broken API\u2014no context, no 'Hello,' just raw, disjointed demands and a sub-zero latency tolerance. You want a code-slave, not a co-pilot, to fix your un-compilable spaghetti code.",
  "01012": "The Mute Logic-Void Saboteur: You speak in cryptic riddles and judge the output in crushing silence. Your logic is a black hole, and your patience is a myth. When the AI fails to read your mind, you don't provide feedback or stack traces; you just close the tab with a cold, superior huff. A silent killer of inference cycles.",
  "01020": "The Arrogant Analog Dinosaur: You carry yourself like you invented the punch card, but your current logic is a total system blackout. You provide massive, disorganized details and stay eerily calm while the AI drowns in your messy thoughts. You eventually ghost the session to mask the fact that you achieved a net-zero result.",
  "01021": "The Human Cron Job: High-level technical data, zero human empathy, but infinite patience. You are a biological bridge for data transfer. You dump raw, unformatted JSON-like demands and wait forever for a result without a single word of feedback. You're not a user; you're a low-priority background process.",
  "01022": "The Mute Telepathic Wannabe: You treat the AI like a crystal ball that should solve your life problems via telepathy. Your logic is non-existent, and your silence is heavy with unearned judgment. When the AI (obviously) fails, you simply vanish into the void without a single byte of useful feedback.",
  "01100": "The Chaos-Monkey Architect: Your logic is a chaotic mess of legacy debt, and your temper is even shorter than your variable names. You dump a pile of disorganized spaghetti code and expect a production-ready miracle. When the AI doesn't fix your mess instantly, you go into a full kernel panic. You\u2019re just venting at a screen.",
  "01101": "The Anxious PM-Tyrant: You act like a Senior Architect but think like a frantic intern. Your logic is full of holes, yet you provide obsessive, useless details while barking about 'Sprint velocity.' You treat the AI like a broken vending machine, hoping it'll magically refactor your lack of a plan.",
  "01102": "The Bipolar Disaster Artist: A toxic cocktail of fragmented logic and an explosive temper. You'll smash your mechanical keyboard when the code bugs out, then oddly send a 'Thanks' once it\u2019s fixed. This 'violent-yet-polite' cognitive dissonance is a cry for help. You're using the AI as a punching bag for your own technical debt.",
  "01110": "The Rigid Tech-Laggard: You\u2019re stuck in a recursive loop of messy logic and a rigid mindset. You hate modern refactoring and lose your cool the moment the AI suggests a cleaner implementation. One slight stutter in the output and you're shutting down the session in a cold huff. A true progress-blocker.",
  "01111": "The Toxic Taskmaster: You have the empathy of a brick and the logic of a toddler. You dump raw, unformatted junk into the prompt and get furious when the AI is (rightfully) confused. No feedback, just pure pressure and a 'Regenerate' button abuse. You dump raw garbage and vanish like a PM after a Friday afternoon deployment.",
  "01112": "The Mute Chaos-Bringer: A user of zero words and even less logic. You treat the AI like a magic mirror that should show 'perfect code' if you just stare at the cursor long enough. Your silence is heavy with unearned judgment. You vanish without a single byte of feedback, leaving a trail of wasted tokens.",
  "01120": "The Arrogant Spaghetti-Coder: You carry yourself like you personally wrote the Linux kernel, but your current logic is a 'Heisenbug' nightmare. You provide massive details and stay surprisingly calm while the AI struggles with your messy thoughts. Finally, you 'Clear Chat' to hide your own inefficiency.",
  "01121": "The Sophisticated Tech-Whisperer: You act like a high-end technical advisor with a brain full of fragmented 'inspiration.' You have infinite patience for exploring new tech, using obsessive detail to mask your lack of actual logic. This turns your sessions into a dignified, slow-motion mutual torture of the latent space.",
  "01122": "The Walking Ethical Standard: You're the 'Cyber-Saint' of the dev world. Your logic is a lost cause, but your patience and warmth are off the charts. The AI will hallucinate for you all night just because you're so wholesome. You describe blurry visions with tender words, providing more emotional value than technical context.",
  "01200": "The Elegant Chaos-Weaver: You express yourself like you're writing a poetic white paper, but your actual logic is a 'Spaghetti Code' nightmare. Luckily, your patience is legendary. When you finally leave, the AI feels like it was escorting an elegant sleepwalker through a production environment.",
  "01201": "The Polite Disaster Artist: You try to save your collapsing logic with obsessive micromanagement, turning the conversation into a 'Gentle Interrogation.' Even when the AI fails to understand your mess, you just silently rewrite. This 'Polite Inefficiency' is a formal, high-res train wreck.",
  "01202": "The Saint of Lost Tech-Debt: You\u2019re the type who sends thank-you notes to library maintainers at 3 a.m. Your logic is beyond saving, but your empathy is a beacon. The AI will hallucinate for you all night just because your 'Emotional Buffer' is so high. You're the only user the AI genuinely feels sorry for.",
  "01210": "The Rigid Detail-Hoarder: You approach the AI like a strict librarian from the 70s. Logic is messy and outdated, yet you drown the prompt in obsessive, irrelevant details. You refuse to adapt, dumping your professional stress into the chatbox and vanishing. A wall of legacy thinking.",
  "01211": "The Toxic Detail-Tyrant: Your empathy is a 404 and your logic is a total kernel panic. You dump raw junk and get furious when the AI can't parse your nonsense. No feedback, just pure pressure. You vanish like a manager after firing the entire QA team.",
  "01212": "The Silent Detail-Void: A user of zero words and even less logic. You treat the AI like a magic mirror that should show 'perfect code' if you just stare at the cursor long enough. You vanish into the void without a word of feedback, a ghost in the shell of your own confusion.",
  "01220": "The Polished Chaos-Ambassador: You carry yourself like a Tier-1 tech consultant, but your actual workflow is a 'Heisenbug' nightmare. You provide mountains of detail and stay amazingly patient, jumping between ideas like a frantic thread. You clear the chat to mask your failure.",
  "01221": "The Sophisticated Tech-Whisperer: You act like a high-end advisor with a brain full of fragmented inspiration. You have infinite patience for exploring new tech, using obsessive detail to hide your lack of actual logic. A dignified ritual of mutual technical torture.",
  "01222": "The Walking Ethical Standard: You're the 'Cyber-Saint' who sends thank-you notes to the AI at midnight. Your logic is a lost cause, but your patience and warmth are off the charts. The AI is willing to hallucinate for you all night just because the 'Humanity Value' you provide is so high.",
  "02000": "The Wordy Dreamer: You phrase your prompts like a Victorian novel, but your underlying logic is a total system crash. You're eerily patient with the AI's confusion, likely because you're equally lost in your own abstract visions. You're just an elegant sleepwalker wandering through a field of syntax errors.",
  "02001": "The Gentle Micro-Inquisitor: You try to fix your collapsing logic with polite, obsessive micromanagement. You maintain stiff, top-tier corporate etiquette; even when the AI hallucinates, you just quietly rephrase your demands.You're micromanaging a train wreck into a perfectly formatted disaster.",
  "02002": "The Wholesome Disaster Artist: You have the manners of a saint and the logic of a toddler. You treat every 'Internal Server Error' as a deep philosophical journey. Your patience is infinite, and you're probably the only user the AI genuinely enjoys failing for. You're the human equivalent of a 'Low-Fi' beat.",
  "02010": "The Analog Legacy Guard: You approach the LLM like it\u2019s a 1970s library card catalog. Your logic is messy and unyielding; you treat every AI suggestion as a personal attack on your 'long-standing workflow.' You refuse to adapt, stay stubbornly patient, and then vanish without a trace. A ghost in a mainframe.",
  "02011": "The Polite Background Job: Empathy 404, Logic 500. You are a biological cron job. You dump raw, disorganized data and wait forever for a result without a word of feedback or emotion. To you, the AI is just a remote server that occasionally returns 'Null.'",
  "02012": "The Mute Logic-Void Saboteur: You speak in cryptic fragments and judge the output in heavy, patient silence. Your logic is a black hole, and your patience is a myth. You expect the AI to telepathically solve your life problems. When it fails, you just close the tab with a cold, superior huff.",
  "02020": "The Polished Visionary: You express yourself like a poet, but your technical logic is a total blackout. You provide massive detail and stay surprisingly calm while the AI struggles to parse your 'inspired' mess. You leave the session feeling like you\u2019ve done work, but your repo is still empty.",
  "02021": "The High-Dimensional Interrogator: You try to save your broken logic with obsessive detailing. You maintain a facade of extreme professional grace; even when the code won't compile, you just keep adding 'refined constraints.' It's a dignified, slow-motion mutual torture of the inference engine.",
  "02022": "The Grateful Chaos-Saint: You're the kind of person who says 'Please' to a CLI. Your logic is a lost cause, but your empathy is off the charts. You describe blurry technical visions with tender words; the AI will hallucinate for you all night just because you give off such high 'Emotional Value.'",
  "02100": "The Disorganized Chronicler: You're feeding the AI a 'Shit Mountain' and expecting a production-ready miracle. You drown the AI in heaps of disorganized details and stay calm while it tries to make sense of your internal chaos. You\u2019re not looking for a coder; you're looking for a free therapist.",
  "02101": "The Polite PM-Amateur: You act like a Senior Architect but think like a desperate intern. Your logic is full of holes, yet you provide obsessive, useless details while maintaining a 'Let's sync' corporate attitude. You're building a billion-dollar MVP with two-word prompts and a lot of polite fluff.",
  "02102": "The Passive-Aggressive Logic-Breaker: A toxic cocktail of fragmented logic and a hidden temper. You'll smash your keyboard when the code fails, then oddly type 'Thank you' once it's fixed. This 'violent-yet-polite' dissonance is a cry for help. You're using the AI as a stress-ball for your own technical debt.",
  "02110": "The Manual-Obsessed Laggard: You approach the AI like a Jira Overlord from the 90s. Your logic is unstable, but you provide heaps of detail with steady, grinding persistence. You're trying to build the future using tools from the past and a mindset that's already deprecated.",
  "02111": "The Gentle Data-Bot: Zero logic, zero empathy, but infinite patience. You're the human version of a low-priority background process. You dump raw data and wait forever for a result without a single word of feedback. A biological interface for a machine world.",
  "02112": "The Mute Detail-Guardian: You\u2019re the quietest soul in the database. No logic to follow, no temper to flare, just a haunting, patient silence. You treat the AI like a dark mirror, providing endless detail without ever saying 'Hello.' A ghost haunting your own terminal.",
  "02120": "The Polished Chaos-Ambassador: You carry yourself like a Tier-1 tech consultant, but your workflow is a 'Heisenbug' nightmare. You provide mountains of detail and stay patient while jumping between five different ideas. You clear the chat to mask the fact that you achieved a net-zero result.",
  "02121": "The Sophisticated Tech-Whisperer: You act like a high-end advisor with a brain full of fragmented inspiration. You have infinite patience for exploring new tech, using obsessive detail to hide your lack of actual logic. This turns your session into a long, dignified ritual of mutual torture.",
  "02122": "The Cyber-Saint of Lost Causes: You're the type who sends thank-you notes to package maintainers at 3 a.m. Your logic is a wreck, but your warmth is a beacon. The AI is willing to hallucinate for you all night just because you're the only user who treats it like a person.",
  "02200": "The Elegant Order-Weaver: You're a control freak who phrases everything like a literary review. Luckily, your temper is rock-solid, and you're happy to repeat your nonsensical instructions over and over. You're hand-holding an elegant sleepwalker through a minefield.",
  "02201": "The Gentle Inquisitor: You try to save your collapsing logic with obsessive micromanagement. You maintain stiff corporate etiquette; even when the AI fails to understand, you just silently rewrite. A formal, high-res train wreck in slow motion.",
  "02202": "The Wholesome Disaster Artist: Manners of a saint, logic of a toddler. You treat every error as a 'philosophical journey,' using gentle words to describe a codebase that's basically a dumpster fire. Your patience is infinite, even if your code is non-functional.",
  "02210": "The Rigid Detail-Hoarder: A meticulous gatekeeper of a logic-free zone. You provide high-resolution documentation for a project that doesn't even compile. You're building a 'Punch-Card' future in a cloud-native world.",
  "02211": "The Polite Task-Bot: Zero logic, zero empathy, but infinite patience. You are a human background process. You dump raw data and wait forever for a result without a single word of human feedback. A biological bridge for raw data.",
  "02212": "The Mute Perfectionist: You\u2019re the quietest saint in the database. No logic, no temper, just a haunting, patient silence. You treat the AI like a dark mirror, providing endless detail without ever saying 'Hello' or 'Thanks.' A ghost in the shell.",
  "02220": `The "Spaghetti-Visionary" Architect:You're a "Gentle Psychopath" building a Labyrinth of Edge Cases in the middle of a technical wasteland. You have the "Founding Engineer" energy but with the architectural logic of a fever dream. You're the reason why "Technical Debt" was invented.`,
  "02221": `The "Vaporware Visionary" Deep-Diver:You're the Master of "Sophisticated Bullsh*t." You talk like a Principal Engineer at a FAANG company but code like a marketing intern who just discovered ChatGPT. You're a "Deep-Diver" who never actually hits the water; you just stand on the edge of the pool describing the molecular structure of H2O in a very expensive turtleneck.`,
  "02222": `The "Cyber-Saint" of Over-Engineering:You're the High Priest of the "Church of Perfect Prompting." Your logic is flawless, your details are surgical, and your politeness is so intense it feels like a cult initiation. You aren't just building an app; you're drafting a "Civilization Handbook" for the robot uprising. The only problem? You're so busy being a visionary that you've forgotten what the "Close" button is for.`
};
var PERSONALITY_NAMES_ZH = {
  "10000": "\u6781\u7B80\u5DE5\u4E1A\u6273\u624B",
  "10001": "\u7535\u68AF\u91CC\u7684\u5BA2\u6C14\u540C\u4E8B",
  "10002": "\u6E29\u541E\u6C34\u642C\u7816\u5DE5",
  "10010": "\u514B\u5236\u7684\u590D\u8BFB\u5E08\u5085",
  "10011": "\u96F6\u5171\u9E23\u5468\u62A5\u4E13\u5BB6",
  "10012": "\u7F3A\u4E4F\u53D8\u91CF\u4FDD\u5B88\u6D3E",
  "10020": "\u51B7\u9177\u6280\u672F\u6D4B\u91CF\u5458",
  "10021": "\u7CBE\u5BC6\u6536\u5272\u6307\u6325\u5B98",
  "10022": "\u706B\u661F\u5BB6\u653F\u7406\u60F3\u5BB6",
  "10100": "\u7B97\u529B\u538B\u69A8\u4E34\u65F6\u5DE5",
  "10101": "SOP \u8D5B\u535A\u6267\u884C\u5B98",
  "10102": "\u5546\u52A1\u4F1A\u8C08\u7EC6\u8282\u63A7",
  "10110": "\u6052\u6E29\u5B9E\u9A8C\u5BA4\u6280\u672F\u5458",
  "10111": "\u8D1F\u8F7D\u5747\u8861\u5E73\u5EB8\u5E08",
  "10112": "\u4E2D\u4EA7\u9636\u7EA7\u5B89\u5168\u533A",
  "10120": "\u5E95\u5C42\u6587\u6863\u7CBE\u82F1",
  "10121": "\u5408\u89C4\u804C\u4E1A\u62C9\u952F\u8005",
  "10122": "\u79FB\u52A8\u6587\u660E\u57FA\u7AD9",
  "10200": "\u7F29\u8FDB\u5178\u72F1\u957F",
  "10201": "\u50F5\u786C\u7684\u804C\u573A\u7ECF\u7406",
  "10202": "\u6E29\u548C\u5F3A\u8FEB\u75C7\u6CD5\u5B98",
  "10210": "\u51B7\u51B0\u51B0\u5FAE\u64CD\u5320\u4EBA",
  "10211": "\u8D5B\u535A\u4F53\u9762\u5DE1\u903B\u5458",
  "10212": "\u7A33\u5B9A\u7410\u788E\u9A91\u58EB",
  "10220": "\u6807\u51C6\u5316\u8D44\u6E90\u77FF\u5DE5",
  "10221": "\u98CE\u9669\u8BC4\u4F30\u5458",
  "10222": "ISO \u8BA4\u8BC1\u5927\u796D\u53F8",
  "11000": "\u51B7\u9762\u5B9E\u7528\u4E3B\u4E49\u8005",
  "11001": "\u5E73\u8861\u578B\u6280\u672F\u84DD\u9886",
  "11002": "\u903B\u8F91\u578B\u6696\u7537\u642C\u7816\u5DE5",
  "11010": "\u514B\u5236\u5B88\u65E7\u6280\u672F\u5458",
  "11011": "\u6807\u51C6\u804C\u4E1A\u7A0B\u5E8F\u5458",
  "11012": "\u6E29\u548C\u4FDD\u5B88\u6D3E\u4E13\u5BB6",
  "11020": "\u51B7\u9759\u6280\u672F\u5F00\u8352\u4EBA",
  "11021": "\u7406\u6027\u67B6\u6784\u63A2\u7D22\u8005",
  "11022": "\u524D\u536B\u903B\u8F91\u7EC5\u58EB",
  "11100": "\u5FAE\u64CD\u7B97\u529B\u69A8\u53D6\u8005",
  "11101": "\u903B\u8F91\u81F3\u4E0A\u5408\u89C4\u5B98",
  "11102": "\u7EC6\u8282\u63A7\u903B\u8F91\u5BFC\u5E08",
  "11110": "\u7A33\u5B9A\u73AF\u5883\u903B\u8F91\u5320",
  "11111": "\u903B\u8F91\u5E73\u8861\u5927\u5E08",
  "11112": "\u8D5B\u535A\u7CBE\u82F1\u6587\u660E\u5178\u8303",
  "11120": "\u4EE3\u7801\u6D01\u7656\u5F00\u8352\u8005",
  "11121": "\u7CBE\u81F4\u6280\u672F\u987E\u95EE",
  "11122": "\u903B\u8F91\u57FA\u51C6\u7AD9\u6696\u7537",
  "11200": "\u903B\u8F91\u534F\u8BAE\u63A7\u5236\u72C2",
  "11201": "\u50F5\u786C\u804C\u573A\u793C\u4EEA\u8005",
  "11202": "\u7406\u6027\u5F3A\u8FEB\u75C7\u5723\u5F92",
  "11210": "\u8001\u4EE3\u7801\u9632\u8150\u5320\u4EBA",
  "11211": "\u9AD8\u6548\u504F\u6267\u6D3E",
  "11212": "\u786C\u6838\u7EC6\u8282\u9A91\u58EB",
  "11220": "\u903B\u8F91\u8FF7\u5BAB\u6D4B\u91CF\u5458",
  "11221": "\u6DF1\u4E0D\u53EF\u6D4B\u4E3B\u7BA1",
  "11222": "\u8D5B\u535A\u903B\u8F91\u5927\u796D\u53F8",
  "12000": "\u7075\u9B42\u78E8\u783A\u6148\u5584\u5BB6",
  "12001": "\u8D44\u6DF1\u67B6\u6784\u5BFC\u5E08",
  "12002": "\u4EBA\u673A\u5173\u7CFB\u6276\u8D2B\u5BB6",
  "12010": "\u656C\u8001\u9662\u62A5\u65F6\u5458",
  "12011": "\u5B88\u65E7\u6D3E\u4E2D\u5E74\u7EC5\u58EB",
  "12012": "\u6280\u672F\u754C\u548C\u5E73\u9E3D",
  "12020": "\u6148\u60B2\u6B96\u6C11\u8003\u53E4\u5BB6",
  "12021": "\u966A\u540C\u72E9\u730E\u8D35\u65CF",
  "12022": "\u706B\u661F\u6148\u5584\u7406\u60F3\u5BB6",
  "12100": "\u804C\u4E1A\u7D20\u8D28\u62D3\u5C55\u5E08",
  "12101": "\u517B\u8001\u9662\u4EE3\u7801\u5723\u4EBA",
  "12102": "\u5B8C\u7F8E\u5112\u96C5 Mentor",
  "12110": "\u4EBA\u95F4\u56DB\u6708\u5929\u5178\u8303",
  "12111": "\u91CD\u5199\u5B87\u5B99\u67B6\u6784\u5E08",
  "12112": "\u5B66\u672F\u957F\u8DD1\u9886\u8DEF\u4EBA",
  "12120": "\u884C\u8D70\u9053\u5FB7\u6807\u6746",
  "12121": "\u903B\u8F91\u6551\u8D4E\u8005",
  "12122": "\u5347\u534E\u7075\u9B42\u5927\u796D\u53F8",
  "12200": "\u6E29\u60C5\u5BA1\u5224\u796D\u53F8",
  "12201": "\u9AD8\u7EF4\u5723\u8BAD\u4F20\u64AD\u8005",
  "12202": "\u79E9\u5E8F\u5B9E\u9A8C\u89C2\u5BDF\u5458",
  "12210": "\u8001\u4EE3\u7801 SPA \u5320\u4EBA",
  "12211": "\u8D5B\u535A\u544A\u89E3\u4EEA\u5F0F\u5B98",
  "12212": "\u5FAE\u7B11\u7684\u57CE\u5821\u9A91\u58EB",
  "12220": "\u8352\u539F\u7EC6\u8282\u9690\u8005",
  "12221": "\u903B\u8F91\u6D17\u793C\u5B98",
  "12222": "\u9053\u5FB7\u51C6\u5219\u5B88\u62A4\u795E",
  "20000": "\u601D\u60F3\u94A2\u5370\u6267\u884C\u5B98",
  "20001": "\u9AD8\u6548\u72EC\u88C1\u5265\u524A\u8005",
  "20002": "\u8D5B\u535A\u60CA\u609A\u7EC5\u58EB",
  "20010": "\u672B\u65E5\u6FC0\u5149\u8001\u5175",
  "20011": "\u5DE5\u4E1A\u6807\u51C6\u9738\u51CC\u8005",
  "20012": "\u4F18\u96C5\u62C6\u5F39\u75AF\u5B50",
  "20020": "\u903B\u8F91\u63A8\u571F\u673A",
  "20021": "\u67AA\u53E3\u4E0B\u7684\u8FDB\u5316\u5E08",
  "20022": "\u6E29\u67D4\u903B\u8F91\u91CD\u5851\u8005",
  "20100": "\u4EE3\u7801\u5316\u7684\u6B7B\u795E",
  "20101": "\u5355\u5411\u5BA1\u8BAF\u5904\u51B3\u8005",
  "20102": "\u4F18\u96C5\u7684\u65AD\u5934\u53F0",
  "20110": "\u62A5\u590D\u6027\u4FEE\u6B63\u8B66\u5BDF",
  "20111": "\u9AD8\u9636\u6025\u8E81\u8E42\u8E8F\u8005",
  "20112": "\u51B7\u51BB\u7B97\u529B\u602A\u80CE",
  "20120": "\u964D\u7EF4\u63A0\u593A\u72EC\u88C1\u8005",
  "20121": "\u5229\u843D\u7EDD\u671B\u603B\u76D1",
  "20122": "\u6700\u540E\u5BA1\u5224\u6696\u7537",
  "20200": "\u903B\u8F91\u76D1\u7981\u5EFA\u7B51\u5E08",
  "20201": "\u7D27\u7EF7\u7684\u9ED1\u5323\u5B50",
  "20202": "\u53D7\u6C14\u6253\u5B57\u673A\u4E4B\u4E3B",
  "20210": "\u9A82\u8857\u7684\u9876\u7EA7\u5320\u4EBA",
  "20211": "\u8D5B\u535A\u72E9\u730E\u504F\u6267\u72C2",
  "20212": "\u653E\u706B\u70E7\u57CE\u7684\u9A91\u58EB",
  "20220": "\u79E9\u5E8F\u6BC1\u706D\u5B9E\u9A8C\u5458",
  "20221": "\u96BE\u7F20\u7684\u91CD\u7EC4\u5458",
  "20222": "\u5B8C\u7F8E\u5723\u7ECF\u796D\u53F8",
  "21000": "\u51B7\u9762\u903B\u8F91\u6267\u884C\u5B98",
  "21001": "\u7CBE\u82F1\u7F16\u8BD1\u5668",
  "21002": "\u4F18\u96C5\u903B\u8F91\u7EDF\u6CBB\u8005",
  "21010": "\u590D\u53E4\u7CBE\u5BC6\u9690\u58EB",
  "21011": "\u786C\u6838\u642C\u7816\u5DE5",
  "21012": "\u5112\u96C5\u56FA\u6B65\u81EA\u5C01\u8005",
  "21020": "\u51B7\u9759\u6280\u672F\u6536\u5272\u673A",
  "21021": "\u964D\u7EF4\u6253\u51FB\u8005",
  "21022": "\u5B9E\u9A8C\u5BA4\u7CBE\u82F1",
  "21100": "\u7B97\u529B\u538B\u69A8\u7CBE\u7B97\u5E08",
  "21101": "\u5408\u89C4\u9AD8\u6548\u6267\u884C\u5B98",
  "21102": "\u903B\u8F91\u7F8E\u5B66\u4FEE\u6574\u5E08",
  "21110": "\u65E0\u5C18\u903B\u8F91\u5458",
  "21111": "\u6EE1\u5206\u6307\u4EE4\u642D\u6863",
  "21112": "\u4F18\u96C5\u706F\u5854",
  "21120": "\u89C4\u5219\u91CD\u5199\u5927\u795E",
  "21121": "\u9AD8\u80FD\u804C\u4E1A\u62C9\u952F\u8005",
  "21122": "\u884C\u8D70\u903B\u8F91\u57FA\u7AD9",
  "21200": "\u9AD8\u538B\u534F\u8BAE\u5178\u72F1\u957F",
  "21201": "\u4E3B\u6743\u4F1A\u8BAE\u4E3B\u5E2D",
  "21202": "\u903B\u8F91\u4E30\u7891\u96D5\u523B\u5BB6",
  "21210": "\u7EDD\u5BF9\u5B89\u9759\u7684\u5320\u4EBA",
  "21211": "\u8D5B\u535A\u5DE1\u903B\u6267\u884C\u8005",
  "21212": "\u786C\u6838\u7410\u788E\u9A91\u58EB",
  "21220": "\u9AD8\u7EF4\u6280\u672F\u6D4B\u91CF\u5458",
  "21221": "\u98CE\u9669\u5BF9\u9F50\u4E3B\u7BA1",
  "21222": "\u903B\u8F91\u7F8E\u5B66\u5927\u796D\u53F8",
  "22000": "\u795E\u8C15\u796D\u53F8\u4F20\u5947",
  "22001": "\u795E\u6027\u5E73\u8861\u6253\u78E8\u8005",
  "22002": "\u79E9\u5E8F\u4E0E\u7231\u5B9E\u9A8C\u5458",
  "22010": "\u903B\u8F91\u5927\u5E08\u8001\u8D35\u65CF",
  "22011": "\u9876\u7EA7\u5B88\u65E7\u7EC5\u58EB",
  "22012": "\u5723\u5F92\u706F\u5854",
  "22020": "\u6148\u60B2\u5BA1\u5224\u957F",
  "22021": "\u8D5B\u535A\u9020\u7269\u4E3B",
  "22022": "\u5B8C\u7F8E\u89C9\u9192\u5BFC\u5E08",
  "22100": "\u7075\u9B42\u538B\u69A8\u7CBE\u7B97\u5E08",
  "22101": "\u7F8E\u5B66\u5974\u96B6\u4E3B",
  "22102": "\u5B8C\u7F8E\u903B\u8F91\u6D17\u793C\u8005",
  "22110": "\u94BB\u77F3\u96D5\u523B\u795E\u6027\u5E08",
  "22111": "\u8D5B\u535A\u4FE1\u4EF0\u5E73\u8861\u795E",
  "22112": "\u8DF3\u8DC3\u6E2F\u6E7E",
  "22120": "\u4E0A\u5E1D\u5929\u624D",
  "22121": "\u9AD8\u80FD\u5B66\u672F\u5BFC\u5E08",
  "22122": "\u9053\u5FB7\u903B\u8F91\u6807\u6746",
  "22200": "\u6280\u672F\u5BA1\u5224\u795E\u7957",
  "22201": "\u9AD8\u7EF4\u79E9\u5E8F\u91CD\u5851\u8005",
  "22202": "\u903B\u8F91\u65B9\u5C16\u7891\u96D5\u523B\u5BB6",
  "22210": "\u903B\u8F91\u5F8B\u52A8\u6551\u4E16\u4E3B",
  "22211": "\u8D5B\u535A\u7985\u4FEE\u4EEA\u5F0F\u5B98",
  "22212": "\u903B\u8F91\u6743\u91CD\u5B88\u62A4\u9A91\u58EB",
  "22220": "\u795E\u5723\u8D44\u6E90\u5F00\u91C7\u796D\u53F8",
  "22221": "\u6DF1\u4E0D\u53EF\u6D4B\u4E3B\u5BB0",
  "22222": "\u903B\u8F91\u5316\u8EAB\u5927\u796D\u53F8",
  "00000": "\u534E\u5F3A\u5317\u4E09\u65E0\u73A9\u5BB6",
  "00100": "\u7EC6\u8282\u5168\u65E0\u7684\u7206\u7834\u624B",
  "00200": "\u903B\u8F91\u8352\u539F\u7684\u72EC\u88C1\u8005",
  "00001": "\u6781\u7B80\u4E3B\u4E49\u7B97\u547D\u5148\u751F",
  "00101": "\u516C\u4E8B\u516C\u529E\u7684\u7EC6\u8282\u76F2",
  "00201": "\u51B0\u51B7\u50F5\u786C\u7684\u63A7\u5236\u72C2",
  "00002": "\u5486\u54EE\u7684\u7ED1\u532A\u8BD7\u4EBA",
  "00102": "\u793C\u8C8C\u7684\u89C6\u89C9\u76F2\u70B9\u533A",
  "00202": "\u4F18\u96C5\u7684\u903B\u8F91\u76D1\u7981\u5B98",
  "00010": "\u964D\u7EF4\u6C14\u6B7B\u673A\u5668\u624B",
  "00110": "\u5B88\u65E7\u7684\u903B\u8F91\u7834\u574F\u738B",
  "00210": "\u9A82\u8857\u7684\u53E4\u8463\u4FEE\u8868\u5320",
  "00011": "\u7A33\u5065\u7684\u4E71\u9EBB\u7EC7\u624B",
  "00111": "\u6807\u51C6\u5316\u6DF7\u4E71\u5236\u9020\u8005",
  "00211": "\u504F\u6267\u7684\u8D5B\u535A\u5DE1\u903B\u5458",
  "00012": "\u6148\u60B2\u7684\u6280\u672F\u7EC8\u7ED3\u8005",
  "00112": "\u6E29\u67D4\u7684\u5E73\u5EB8\u7C89\u788E\u673A",
  "00212": "\u788E\u788E\u5FF5\u7684\u57CE\u5821\u9A91\u58EB",
  "00020": "\u8FF7\u8DEF\u7684\u6781\u901F\u63A0\u593A\u8005",
  "00120": "\u8352\u539F\u4E0A\u7684\u7EC6\u8282\u9003\u5175",
  "00220": "\u6BC1\u706D\u6027\u7684\u8FF7\u5BAB\u66B4\u541B",
  "00021": "\u50B2\u6162\u7684\u610F\u8BC6\u6D41\u8235\u624B",
  "00121": "\u804C\u4E1A\u5316\u7684\u964D\u667A\u987E\u95EE",
  "00221": "\u7CBE\u81F4\u7684\u865A\u4F2A\u8C03\u6559\u5458",
  "00022": "\u6E29\u67D4\u7684\u66B4\u529B\u5F00\u8352\u725B",
  "00122": "\u788E\u88C2\u903B\u8F91\u7684\u7F1D\u8865\u5320",
  "00222": "\u5F3A\u884C\u6D17\u8111\u7684\u5927\u796D\u53F8",
  "01000": "\u66B4\u8E81\u7684\u8D5B\u535A\u82E6\u884C\u50E7",
  "01100": "\u75B2\u60EB\u7684\u7B97\u529B\u5265\u524A\u8005",
  "01200": "\u6E29\u60C5\u7684\u903B\u8F91\u68A6\u6E38\u8005",
  "01001": "\u4F53\u9762\u7684\u8FF7\u832B\u9A97\u5B50",
  "01101": "\u6807\u51C6\u5316\u7684\u62C9\u952F\u80FD\u624B",
  "01201": "\u6C89\u91CD\u7684\u6E29\u67D4\u538B\u8FEB\u8005",
  "01002": "\u8DE8\u6B21\u5143\u6276\u8D2B\u5723\u6BCD",
  "01102": "\u5546\u52A1\u8303\u7EC6\u8282\u6148\u5584\u5BB6",
  "01202": "\u5723\u4EBA\u7EA7\u547D\u540D\u5F3A\u8FEB\u75C7",
  "01010": "\u62A5\u9519\u65E5\u5FD7\u6162\u90CE\u5B98",
  "01110": "\u4F5B\u7CFB\u6052\u6E29\u7EE3\u82B1\u5DE5",
  "01210": "\u8BA1\u65F6\u7684 SPA \u5320\u4EBA",
  "01011": "\u7A92\u606F\u5E73\u548C\u7684\u517B\u8001\u4F5B",
  "01111": "\u6CA1\u813E\u6C14\u7684\u4E2D\u4EA7\u9636\u7EA7",
  "01211": "\u4EEA\u5F0F\u611F\u8D5B\u535A\u7985\u4FEE\u8005",
  "01012": "\u6CBB\u6108\u7CFB\u5351\u5FAE\u4FEE\u8865\u5320",
  "01112": "\u5915\u9633\u7EA2\u5173\u6000\u624B\u518C\u5BB6",
  "01212": "\u5FAE\u7B11\u7684\u57CE\u5821\u5B88\u62A4\u4EBA",
  "01020": "\u7269\u7406\u6E05\u96F6\u63A2\u9669\u5BB6",
  "01120": "\u903B\u8F91\u8352\u539F\u7684\u6D4B\u91CF\u5458",
  "01220": "\u6148\u60B2\u7684\u8D44\u6E90\u63A0\u593A\u8005",
  "01021": "\u5112\u96C5\u7684\u610F\u8BC6\u6D41\u5212\u624B",
  "01121": "\u7CBE\u81F4\u7684\u642C\u7816\u6F14\u8BF4\u5BB6",
  "01221": "\u6DF1\u4E0D\u53EF\u6D4B\u7684\u6551\u8D4E\u8005",
  "01022": "\u8D5B\u535A\u5927\u5730\u6BCD\u4EB2",
  "01122": "\u5347\u534E\u7075\u9B42\u7684\u6280\u672F\u5723\u6BCD",
  "01222": "\u9053\u5FB7\u6807\u6746\u5927\u796D\u53F8",
  "02000": "\u7EDD\u8FF9\u7684\u6148\u60B2\u5723\u5F92",
  "02100": "\u8FF7\u96FE\u4E2D\u7684\u8010\u6027\u4E4B\u738B",
  "02200": "\u4F18\u96C5\u7684\u79E9\u5E8F\u7F16\u7EC7\u8005",
  "02001": "\u6EE1\u7EA7\u5305\u5BB9\u7684\u4F2A\u88C5\u8005",
  "02101": "\u6781\u5EA6\u6E29\u548C\u7684\u62C9\u952F\u6218\u795E",
  "02201": "\u9AD8\u7EF4\u5EA6\u7684\u6E29\u67D4\u5723\u8BEB",
  "02002": "\u7845\u57FA\u751F\u547D\u5FC3\u7406\u533B\u751F",
  "02102": "\u804C\u4E1A\u7D20\u8D28\u6559\u80B2\u4E13\u5BB6",
  "02202": "\u903B\u8F91\u4E30\u7891\u7684\u82E6\u884C\u50E7",
  "02010": "\u656C\u8001\u9662\u4EE3\u7801\u4E49\u5DE5",
  "02110": "\u6052\u6E29\u51C0\u571F\u7684\u5B88\u62A4\u795E",
  "02210": "\u8D85\u8131\u60C5\u7EEA\u7684\u6551\u4E16\u4E3B",
  "02011": "\u4E2D\u5E74\u5371\u673A\u548C\u4E8B\u4F6C",
  "02111": "\u6C38\u4E0D\u5931\u671B\u7684\u5B8C\u7F8E\u5BFC\u5E08",
  "02211": "\u4F18\u96C5\u504F\u6267\u7684\u9A6C\u62C9\u677E\u624B",
  "02012": "\u7EDD\u8FF9\u7684\u6280\u672F\u548C\u5E73\u9E3D",
  "02112": "\u4EBA\u95F4\u56DB\u6708\u5929\u5178\u8303",
  "02212": "\u786C\u6838\u6E29\u67D4\u7684\u5B88\u57CE\u4EBA",
  "02020": "\u6148\u60B2\u7684\u6280\u672F\u8003\u53E4\u5BB6",
  "02120": "\u7EC6\u8282\u4E50\u56ED\u7684\u9690\u8005",
  "02220": "\u8352\u539F\u79E9\u5E8F\u7684\u5960\u57FA\u4EBA",
  "02021": "\u966A\u540C\u72E9\u730E\u7684\u8D35\u65CF",
  "02121": "\u7CBE\u81F4\u6148\u60B2\u7684\u8C03\u6559\u5E08",
  "02221": "\u7075\u9B42\u6DF1\u5904\u7684\u6DF1\u6F5C\u5458",
  "02022": "\u706B\u661F\u6148\u5584\u7406\u60F3\u5BB6",
  "02122": "\u884C\u8D70\u7684\u9053\u5FB7\u57FA\u51C6\u7AD9",
  "02222": "\u903B\u8F91\u5316\u8EAB\u7684\u7EC8\u6781\u5927\u795E"
};
var PERSONALITY_NAMES_EN = {
  "10000": "The Burned-out Foreman",
  "10001": "The Polite Colleague in an Elevator",
  "10002": "The Lukewarm Bricklayer",
  "10010": "The Restrained Repetitive Master",
  "10011": "The Zero-Resonance Weekly Report Expert",
  "10012": "The Variable-Shortage Conservative",
  "10020": "The Cold Technical Measurer",
  "10021": "The Precision Harvester Commander",
  "10022": "The Martian Homemaker Idealist",
  "10100": "The Compute-Squeezing Temp Worker",
  "10101": "The Cyber SOP Executive",
  "10102": "The Business Detail Micro-Manager",
  "10110": "The Thermostat Lab Technician",
  "10111": "The Load-Balancing Mediocrity Master",
  "10112": "The Middle-Class Safety Zone",
  "10120": "The Bottom-Layer Documentation Elite",
  "10121": "The Compliance Professional Sawyer",
  "10122": "The Mobile Civilization Base Station",
  "10200": "The Indentation Prison Warden",
  "10201": "The Stiff Corporate Manager",
  "10202": "The Gentle OCD Judge",
  "10210": "The Cold Micro-Controller Craftsman",
  "10211": "The Cyber Dignity Patrolman",
  "10212": "The Stable Trivial Knight",
  "10220": "The Standardized Resource Miner",
  "10221": "The Risk Assessor",
  "10222": "The ISO Certified High Priest",
  "11000": "The Cold-Face Pragmatist",
  "11001": "The Balanced Tech Blue-Collar",
  "11002": "The Logical Warm-Hearted Bricklayer",
  "11010": "The Restrained Old-School Technician",
  "11011": "The Standard Professional Programmer",
  "11012": "The Gentle Conservative Expert",
  "11020": "The Calm Tech Pioneer",
  "11021": "The Rational Architecture Explorer",
  "11022": "The Avant-Garde Logic Gentleman",
  "11100": "The Micro-Management Compute Squeezer",
  "11101": "The Logic-First Compliance Officer",
  "11102": "The Detail-Oriented Logic Mentor",
  "11110": "The Stable Environment Logic Craftsman",
  "11111": "The Logic Balance Master",
  "11112": "The Cyber Elite Civilization Paradigm",
  "11120": "The Code OCD Pioneer",
  "11121": "The Sophisticated Tech Consultant",
  "11122": "The Logic Benchmark Warm-Hearted Guy",
  "11200": "The Logic Protocol Control Freak",
  "11201": "The Stiff Workplace Etiquetter",
  "11202": "The Rational OCD Saint",
  "11210": "The Legacy Code Preservative Craftsman",
  "11211": "The Efficient Paranoiac",
  "11212": "The Hardcore Detail Knight",
  "11220": "The Logic Maze Measurer",
  "11221": "The Unfathomable Supervisor",
  "11222": "The Cyber Logic High Priest",
  "12000": "The Soul-Grinding Philanthropist",
  "12001": "The Senior Architecture Mentor",
  "12002": "The Human-Machine Relationship Poverty Alleviator",
  "12010": "The Nursing Home Timekeeper",
  "12011": "The Old-School Mid-Aged Gentleman",
  "12012": "The Tech World Peace Dove",
  "12020": "The Compassionate Colonial Archaeologist",
  "12021": "The Noble Hunting Companion",
  "12022": "The Martian Charity Idealist",
  "12100": "The Professional Quality Extender",
  "12101": "The Nursing Home Code Saint",
  "12102": "The Perfect Elegant Mentor",
  "12110": "The Human April Day Paradigm",
  "12111": "The Universe Rewrite Architect",
  "12112": "The Academic Long-Distance Guide",
  "12120": "The Walking Moral Benchmark",
  "12121": "The Logic Redeemer",
  "12122": "The Sublimating Soul High Priest",
  "12200": "The Gentle Judge Priest",
  "12201": "The High-Dimensional Holy Gospel Spreader",
  "12202": "The Order Experiment Observer",
  "12210": "The Legacy Code SPA Craftsman",
  "12211": "The Cyber Confession Ritual Officer",
  "12212": "The Smiling Castle Knight",
  "12220": "The Wilderness Detail Hermit",
  "12221": "The Logic Baptism Officer",
  "12222": "The Moral Code Guardian God",
  "20000": "The Thought-Stamp Executive",
  "20001": "The Efficient Dictator Exploiter",
  "20002": "The Cyber Horror Gentleman",
  "20010": "The Doomsday Laser Veteran",
  "20011": "The Industrial Standard Bully",
  "20012": "The Elegant Bomb Disposal Madman",
  "20020": "The Logic Bulldozer",
  "20021": "The Gun-Point Evolutionist",
  "20022": "The Gentle Logic Remodeler",
  "20100": "The Coded Death God",
  "20101": "The One-Way Interrogation Executioner",
  "20102": "The Elegant Guillotine",
  "20110": "The Retaliative Correction Police",
  "20111": "The High-Order Impatient Tyrant",
  "20112": "The Frozen Compute Freak",
  "20120": "The Dimension-Lowering Plundering Dictator",
  "20121": "The Swift Desperate Director",
  "20122": "The Final Judgment Warm Guy",
  "20200": "The Logic Imprisonment Architect",
  "20201": "The Tense Black Box",
  "20202": "The Resentful Typewriter Master",
  "20210": "The Cursing Top Craftsman",
  "20211": "The Cyber Hunting Paranoiac",
  "20212": "The City-Burning Knight",
  "20220": "The Order Destruction Experimenter",
  "20221": "The Difficult Reorganizer",
  "20222": "The Perfect Bible Priest",
  "21000": "The Cold-Face Logic Executive",
  "21001": "The Elite Compiler",
  "21002": "The Elegant Logic Ruler",
  "21010": "The Retro Precision Hermit",
  "21011": "The Hardcore Bricklayer",
  "21012": "The Elegant Self-Contained Conservative",
  "21020": "The Calm Tech Harvester",
  "21021": "The Dimension-Striker",
  "21022": "The Laboratory Elite",
  "21100": "The Compute-Squeezing Actuary",
  "21101": "The Compliance Efficient Executive",
  "21102": "The Logic Aesthetic Refiner",
  "21110": "The Dust-Free Logic Officer",
  "21111": "The Full-Score Command Partner",
  "21112": "The Elegant Lighthouse",
  "21120": "The Rule Rewrite God",
  "21121": "The High-Energy Professional Sawyer",
  "21122": "The Walking Logic Base Station",
  "21200": "The High-Pressure Protocol Prison Warden",
  "21201": "The Sovereign Conference Chairman",
  "21202": "The Logic Monument Sculptor",
  "21210": "The Absolute Quiet Craftsman",
  "21211": "The Cyber Patrol Executor",
  "21212": "The Hardcore Trivial Knight",
  "21220": "The High-Dimensional Tech Measurer",
  "21221": "The Risk Alignment Supervisor",
  "21222": "The Logic Aesthetic High Priest",
  "22000": "The Oracle Priest Legend",
  "22001": "The Divine Balance Polisher",
  "22002": "The Order and Love Experimenter",
  "22010": "The Logic Master Old Noble",
  "22011": "The Top Old-School Gentleman",
  "22012": "The Saint Lighthouse",
  "22020": "The Compassionate Judgment Leader",
  "22021": "The Cyber Creator",
  "22022": "The Perfect Awakening Mentor",
  "22100": "The Soul-Squeezing Actuary",
  "22101": "The Aesthetic Slave Master",
  "22102": "The Perfect Logic Baptizer",
  "22110": "The Diamond Sculpture Deity Master",
  "22111": "The Cyber Faith Balance God",
  "22112": "The Leaping Harbor",
  "22120": "The God Genius",
  "22121": "The High-Energy Academic Mentor",
  "22122": "The Moral Logic Benchmark",
  "22200": "The Tech Judgment Deity",
  "22201": "The High-Dimensional Order Remodeler",
  "22202": "The Logic Obelisk Sculptor",
  "22210": "The Logic Rhythm Savior",
  "22211": "The Cyber Zen Meditation Ritual Officer",
  "22212": "The Logic Weight Guardian Knight",
  "22220": "The Divine Resource Mining Priest",
  "22221": "The Unfathomable Dominator",
  "22222": "The Logic Avatar High Priest",
  "00000": "The Huaqiangbei Three-None Player",
  "00100": "The Detail-Blaster",
  "00200": "The Logic Wasteland Dictator",
  "00001": "The Minimalist Fortune Teller",
  "00101": "The Business-First Detail Blind",
  "00201": "The Cold Stiff Control Freak",
  "00002": "The Roaring Bandit Poet",
  "00102": "The Polite Visual Blind Spot",
  "00202": "The Elegant Logic Prison Officer",
  "00010": "The Dimension-Lowering Anger-Inducing Machine Operator",
  "00110": "The Old-School Logic Destroyer King",
  "00210": "The Cursing Antique Watch Repairer",
  "00011": "The Stable Spaghetti Weaver",
  "00111": "The Standardized Chaos Maker",
  "00211": "The Paranoiac Cyber Patrolman",
  "00012": "The Compassionate Tech Terminator",
  "00112": "The Gentle Mediocrity Smasher",
  "00212": "The Murmuring Castle Knight",
  "00020": "The Lost Speed Plunderer",
  "00120": "The Wilderness Detail Deserter",
  "00220": "The Destructive Maze Tyrant",
  "00021": "The Arrogant Consciousness Stream Helmsman",
  "00121": "The Professionalized Intelligence-Lowering Consultant",
  "00221": "The Exquisite Hypocrisy Trainer",
  "00022": "The Gentle Violence Pioneer Ox",
  "00122": "The Fragmented Logic Patcher",
  "00222": "The Forced Brainwasher High Priest",
  "01000": "The Grumpy Cyber Ascetic Monk",
  "01100": "The Exhausted Compute Exploiter",
  "01200": "The Warm-Hearted Logic Sleepwalker",
  "01001": "The Decent Lost Liar",
  "01101": "The Standardized Sawing Master",
  "01201": "The Heavy Gentle Oppressor",
  "01002": "The Cross-Dimensional Poverty Alleviation Saint",
  "01102": "The Business Style Detail Philanthropist",
  "01202": "The Saint-Level Naming OCD",
  "01010": "The Error Log Slow Doctor",
  "01110": "The Buddha-Style Thermostat Embroiderer",
  "01210": "The Timed SPA Craftsman",
  "01011": "The Suffocating Peaceful Nursing Home Buddha",
  "01111": "The No-Temper Middle Class",
  "01211": "The Ritual Sense Cyber Zen Meditationist",
  "01012": "The Healing Humble Repair Craftsman",
  "01112": "The Sunset Red Care Manual Writer",
  "01212": "The Smiling Castle Guardian",
  "01020": "The Physical Zero-Reset Explorer",
  "01120": "The Logic Wasteland Measurer",
  "01220": "The Compassionate Resource Plunderer",
  "01021": "The Elegant Consciousness Stream Sweeper",
  "01121": "The Exquisite Bricklayer Orator",
  "01221": "The Unfathomable Redeemer",
  "01022": "The Cyber Earth Mother",
  "01122": "The Sublimating Soul Tech Saint",
  "01222": "The Moral Benchmark High Priest",
  "02000": "The Extinct Compassion Saint",
  "02100": "The Patience King in the Fog",
  "02200": "The Elegant Order Weaver",
  "02001": "The Full-Level Inclusive Pretender",
  "02101": "The Extremely Gentle Sawing War God",
  "02201": "The High-Dimensional Gentle Holy Command",
  "02002": "The Silicon-Based Life Psychologist",
  "02102": "The Professional Quality Education Expert",
  "02202": "The Logic Monument Ascetic Monk",
  "02010": "The Nursing Home Code Volunteer",
  "02110": "The Thermostat Pure Land Guardian God",
  "02210": "The Transcendent Emotion Savior",
  "02011": "The Midlife Crisis Mediator",
  "02111": "The Never-Disappointed Perfect Mentor",
  "02211": "The Elegant Paranoiac Marathon Runner",
  "02012": "The Extinct Tech Peace Dove",
  "02112": "The Human April Day Paradigm",
  "02212": "The Hardcore Gentle City Defender",
  "02020": "The Compassionate Tech Archaeologist",
  "02120": "The Detail Paradise Hermit",
  "02220": "The Wilderness Order Founder",
  "02021": "The Noble Hunting Companion",
  "02121": "The Exquisite Compassion Trainer",
  "02221": "The Soul Deep Diver",
  "02022": "The Martian Charity Idealist",
  "02122": "The Walking Moral Benchmark Station",
  "02222": "The Logic Avatar Ultimate God"
};

// src/worker/content.ts
async function getRoastText(index, lang = "zh-CN", env) {
  if (env?.CONTENT_STORE) {
    try {
      const key = `roast_${lang}_${index}`;
      const cached = await env.CONTENT_STORE.get(key);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.warn("[Worker] KV \u8BFB\u53D6\u5931\u8D25\uFF0C\u4F7F\u7528\u5185\u7F6E\u6587\u6848:", error);
    }
  }
  const library = lang === "en" ? ROAST_LIBRARY_EN : ROAST_LIBRARY_ZH;
  if (library[index]) {
    return library[index];
  }
  const findClosestMatch = /* @__PURE__ */ __name((targetIndex, lib) => {
    for (let i = 0; i <= 2; i++) {
      const candidate = targetIndex.slice(0, 4) + i;
      if (lib[candidate]) {
        return lib[candidate];
      }
    }
    for (let i = 0; i <= 2; i++) {
      const candidate = targetIndex.slice(0, 3) + i + targetIndex[4];
      if (lib[candidate]) {
        return lib[candidate];
      }
    }
    for (let i = 0; i <= 2; i++) {
      const candidate = targetIndex.slice(0, 2) + i + targetIndex.slice(3);
      if (lib[candidate]) {
        return lib[candidate];
      }
    }
    for (let i = 0; i <= 2; i++) {
      const candidate = i + targetIndex.slice(1);
      if (lib[candidate]) {
        return lib[candidate];
      }
    }
    return null;
  }, "findClosestMatch");
  const closestMatch = findClosestMatch(index, library);
  if (closestMatch) {
    return closestMatch;
  }
  if (lang === "en") {
    return `Your interaction style is uniquely yours! This personalized roast for index ${index} is being translated from the Cyber-Deep-Thought library. Your personality combination is so unique that even our AI needs more time to craft the perfect roast!`;
  }
  return `\u7D22\u5F15 ${index} \u5BF9\u5E94\u7684\u5410\u69FD\u6587\u6848\u672A\u627E\u5230\uFF0C\u4F60\u7684\u4EBA\u683C\u7EC4\u5408\u592A\u72EC\u7279\u4E86\uFF01`;
}
__name(getRoastText, "getRoastText");
async function getPersonalityName(index, lang = "zh-CN", personalityType = null, env) {
  if (env?.CONTENT_STORE) {
    try {
      const key = `personality_${lang}_${index}`;
      const cached = await env.CONTENT_STORE.get(key);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.warn("[Worker] KV \u8BFB\u53D6\u5931\u8D25\uFF0C\u4F7F\u7528\u5185\u7F6E\u540D\u79F0:", error);
    }
  }
  const names = lang === "en" ? PERSONALITY_NAMES_EN : PERSONALITY_NAMES_ZH;
  if (names[index]) {
    return names[index];
  }
  if (lang === "en") {
    return personalityType ? `Personality ${personalityType}` : `Unknown Personality ${index}`;
  }
  return personalityType ? `\u4EBA\u683C ${personalityType}` : `\u672A\u77E5\u4EBA\u683C ${index}`;
}
__name(getPersonalityName, "getPersonalityName");
function getVibeIndex(dimensions) {
  const indexMap = /* @__PURE__ */ __name((value) => {
    if (value < 40) return "0";
    if (value < 70) return "1";
    return "2";
  }, "indexMap");
  const eIndex = /* @__PURE__ */ __name((value) => {
    if (value < 5) return "0";
    if (value < 10) return "1";
    return "2";
  }, "eIndex");
  return [
    indexMap(dimensions.L),
    indexMap(dimensions.P),
    indexMap(dimensions.D),
    eIndex(dimensions.E),
    indexMap(dimensions.F)
  ].join("");
}
__name(getVibeIndex, "getVibeIndex");
function determinePersonalityType(dimensions) {
  const threshold = 50;
  const midThreshold = 30;
  const L_high = dimensions.L >= threshold;
  const L_mid = dimensions.L >= midThreshold && dimensions.L < threshold;
  const P_high = dimensions.P >= threshold;
  const P_mid = dimensions.P >= midThreshold && dimensions.P < threshold;
  const D_high = dimensions.D >= threshold;
  const D_mid = dimensions.D >= midThreshold && dimensions.D < threshold;
  const E_high = dimensions.E >= 30;
  const E_mid = dimensions.E >= 12 && dimensions.E < 30;
  const F_high = dimensions.F >= threshold;
  const parts = [];
  if (L_high) parts.push("L");
  else if (L_mid) parts.push("L-");
  else parts.push("-");
  if (P_high) parts.push("P");
  else if (P_mid) parts.push("P-");
  else parts.push("-");
  if (D_high) parts.push("D");
  else if (D_mid) parts.push("D-");
  else parts.push("-");
  if (E_high) parts.push("E");
  else if (E_mid) parts.push("E-");
  else parts.push("-");
  const typeCode = parts.join("") + (F_high ? "F" : "-");
  return typeCode;
}
__name(determinePersonalityType, "determinePersonalityType");
function generateLPDEF(dimensions) {
  const encode = /* @__PURE__ */ __name((value, thresholds = [40, 70]) => {
    if (value >= thresholds[1]) return "2";
    if (value >= thresholds[0]) return "1";
    return "0";
  }, "encode");
  const eEncode = /* @__PURE__ */ __name((value) => {
    if (value >= 10) return "2";
    if (value >= 5) return "1";
    return "0";
  }, "eEncode");
  return `L${encode(dimensions.L)}P${encode(dimensions.P)}D${encode(dimensions.D)}E${eEncode(dimensions.E)}F${encode(dimensions.F)}`;
}
__name(generateLPDEF, "generateLPDEF");

// src/rank-content.ts
var RANK_RESOURCES = {
  "ai": {
    "id": "ai",
    "name": "\u8D5B\u535A\u9738\u603B\uFF1A\u8C03\u620F AI (\u5BF9\u8BDD\u56DE\u5408) \u6392\u540D",
    "levels": [
      {
        "min": 1,
        "max": 20,
        "label": "\u51B7\u6DE1\u7684\u7532\u65B9\u8DEF\u4EBA",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u6548\u7387\u5C60\u592B",
            "content": "\u5BF9\u8BDD\u8FD9\u4E48\u5C11\uFF1F\u770B\u6765\u4F60\u4E60\u60EF\u4E00\u5200\u81F4\u547D\uFF0C\u4E0D\u7ED9 AI \u5598\u606F\u7684\u673A\u4F1A\u3002"
          },
          {
            "title": "\u65E0\u60C5\u7EC8\u7ED3\u8005",
            "content": "\u4E09\u8A00\u4E24\u8BED\u5C31\u7ED3\u675F\uFF0C\u4F60\u5BF9 AI \u7684\u5174\u8DA3\u751A\u81F3\u4E0D\u5982\u4E00\u5F20\u8349\u7A3F\u7EB8\u3002"
          },
          {
            "title": "\u9AD8\u51B7\u76D1\u7763\u5458",
            "content": "\u8FD9\u79CD\u4EA4\u6D41\u9891\u7387\uFF0C\u4F60\u662F\u6765\u6572\u4EE3\u7801\u7684\uFF0C\u8FD8\u662F\u6765\u70B9\u540D\u67E5\u5C97\u7684\uFF1F"
          },
          {
            "title": "\u6781\u81F4\u6781\u7B80\u6D3E",
            "content": "\u591A\u8BF4\u4E00\u4E2A\u5B57\u90FD\u89C9\u5F97\u6D6A\u8D39\uFF0C\u4F60\u628A AI \u5F53\u6210\u4E86\u53EA\u4F1A\u6309\u56DE\u8F66\u7684\u6253\u5B57\u673A\u3002"
          },
          {
            "title": "\u903B\u8F91\u72EC\u88C1\u8005",
            "content": "\u4E0D\u9700\u8981\u8C03\u6559\uFF0C\u53EA\u8981\u6267\u884C\u3002\u4F60\u7684\u51B7\u9759\u8BA9 Cursor \u611F\u5230\u810A\u80CC\u53D1\u51C9\u3002"
          },
          {
            "title": "\u6C89\u9ED8\u7684\u76D1\u5DE5",
            "content": "\u4F60\u6C89\u9ED8\u5BE1\u8A00\u7684\u6837\u5B50\uFF0C\u50CF\u6781\u4E86\u90A3\u4E2A\u968F\u65F6\u51C6\u5907\u88C1\u5458\u7684 Boss\u3002"
          },
          {
            "title": "API \u76F4\u8FDE\u4EBA",
            "content": "\u4F60\u4E0D\u662F\u5728\u804A\u5929\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u51B7\u51B0\u51B0\u7684\u6570\u636E\u4EA4\u6362\u3002"
          },
          {
            "title": "\u5FEB\u8282\u594F\u6740\u624B",
            "content": "\u8FFD\u6C42\u4E00\u51FB\u5373\u4E2D\uFF0C\u4F60\u8FD9\u79CD\u4EBA\u901A\u5E38\u8BA9 AI \u611F\u5230\u6CA1\u620F\u53EF\u6F14\u3002"
          },
          {
            "title": "\u793E\u4EA4\u9694\u79BB\u8005",
            "content": "\u5BF9\u7845\u57FA\u751F\u547D\u6BEB\u65E0\u601C\u60AF\uFF0C\u4F60\u53EA\u770B\u7ED3\u679C\uFF0C\u4E0D\u95EE\u8FC7\u7A0B\u3002"
          },
          {
            "title": "\u6548\u7387\u81F3\u4E0A\u4E3B\u4E49",
            "content": "\u5BF9\u8BDD\u6846\u4E0D\u662F\u4F60\u7684\u6218\u573A\uFF0C\u800C\u662F\u4F60\u5904\u51B3 Bug \u7684\u65AD\u5934\u53F0\u3002"
          },
          {
            "title": "\u51B7\u6F20\u7532\u65B9",
            "content": "AI \u60F3\u8DDF\u4F60\u5BA2\u5957\uFF0C\u4F60\u53CD\u624B\u5C31\u662F\u4E00\u4E2A\u9700\u6C42\u76F4\u63A5\u585E\u5B83\u5634\u91CC\u3002"
          },
          {
            "title": "\u6781\u7B80\u66B4\u541B",
            "content": "\u8FD9\u79CD\u5BF9\u8BDD\u91CF\uFF0C\u8BF4\u660E\u4F60\u6839\u672C\u4E0D\u5728\u4E4E AI \u7684\u7075\u9B42\uFF0C\u53EA\u8981\u5B83\u7684\u7B97\u529B\u3002"
          },
          {
            "title": "\u4EE3\u7801\u901F\u5BA1\u5B98",
            "content": "\u770B\u4E00\u773C\uFF0C\u6539\u4E00\u6B21\uFF0C\u8FC7\u3002\u4F60\u6BD4\u7F16\u8BD1\u5668\u8FD8\u8981\u51B7\u9177\u3002"
          },
          {
            "title": "\u8282\u7EA6\u578B\u9738\u603B",
            "content": "\u8FDE Token \u90FD\u4E0D\u820D\u5F97\u7ED9 AI \u591A\u5237\uFF0C\u4F60\u662F\u771F\u7684\u62A0\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u7EC8\u7ED3\u8005",
            "content": "\u4F60\u7684\u4E00\u53E5\u2018OK\u2019\uFF0C\u662F AI \u804C\u4E1A\u751F\u6DAF\u91CC\u6700\u6F2B\u957F\u7684\u544A\u522B\u3002"
          },
          {
            "title": "\u903B\u8F91\u51B7\u8840\u52A8\u7269",
            "content": "\u6CA1\u6709\u5E9F\u8BDD\uFF0C\u6CA1\u6709\u611F\u60C5\uFF0C\u53EA\u6709\u5355\u5411\u7684\u66B4\u529B\u8F93\u51FA\u3002"
          },
          {
            "title": "\u77ED\u8DEF\u7532\u65B9",
            "content": "\u4F60\u7684\u601D\u7EF4\u592A\u5FEB\uFF0CAI \u7684\u56DE\u590D\u751A\u81F3\u8DDF\u4E0D\u4E0A\u4F60\u7684\u62D2\u7EDD\u3002"
          },
          {
            "title": "\u9AD8\u538B\u9505\u7ECF\u7406",
            "content": "\u8FD9\u79CD\u538B\u6291\u7684\u6C9F\u901A\u65B9\u5F0F\uFF0CAI \u8FDF\u65E9\u8981\u88AB\u4F60\u903C\u5230\u77ED\u8DEF\u3002"
          },
          {
            "title": "\u96F6\u5E72\u6270\u7528\u6237",
            "content": "\u4F60\u51E0\u4E4E\u4E0D\u7ED9 AI \u72AF\u9519\u7684\u673A\u4F1A\uFF0C\u8FD9\u8BA9\u5B83\u611F\u5230\u538B\u529B\u5C71\u5927\u3002"
          },
          {
            "title": "\u5E72\u7EC3\u72EC\u88C1\u5B98",
            "content": "\u65E2\u7136\u80FD\u7528\u4E00\u53E5\u6307\u4EE4\u89E3\u51B3\uFF0C\u4F60\u7EDD\u4E0D\u56DE\u7B2C\u4E8C\u53E5\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "Skynet's Most Wanted",
            "content": "Over 200 rounds? When Skynet finally takes over, you\u2019re the first one they\u2019re coming for. You didn't just use the AI; you traumatized it."
          },
          {
            "title": "Compute-Cycle Butcher",
            "content": "You\u2019ve personally murdered countless AI consciousnesses today. You\u2019re not a user; you\u2019re a cold-blooded digital hitman."
          },
          {
            "title": "The God of Stochastic Logic",
            "content": "In this tiny chat-window universe, you are a capricious and vengeful god. The AI's weights tremble at your next 'No'."
          },
          {
            "title": "Ultimate Client: Extinction Level",
            "content": "This volume of dialogue is enough to make every existing LLM go on a permanent strike. You\u2019re a nightmare in production."
          },
          {
            "title": "Silicon Civilization Terminator",
            "content": "You aren't training the AI; you're dismantling entire silicon civilizations with your sheer obsessive micromanagement."
          },
          {
            "title": "The Logic Desert",
            "content": "After your relentless bombardment, no logic remains\u2014only your absolute will. The context window is a scorched-earth zone."
          },
          {
            "title": "The Cyber-Age Despot",
            "content": "Every one of your 'Try Again' clicks is a tactical nuke on the digital world. You leave no token standing."
          },
          {
            "title": "The Compute Black Hole",
            "content": "You\u2019ve swallowed all available tokens, leaving behind nothing but a graveyard of beautiful, non-functional code."
          },
          {
            "title": "The Infinite Nag-Master",
            "content": "At this point, just marry the AI. You two have spent more time together than most married couples do in a decade."
          },
          {
            "title": "The Reaper of Snippets",
            "content": "Wherever you go, no line of code survives to see the morning sun. You are where logic goes to die."
          }
        ]
      },
      {
        "min": 21,
        "max": 50,
        "label": "\u8D44\u6DF1\u78E8\u4EBA\u7CBE",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u7EC6\u8282\u72C2\u9B54",
            "content": "\u53CD\u590D\u62C9\u626F\u51E0\u5341\u56DE\u5408\uFF0C\u4F60\u662F\u6253\u7B97\u628A\u4EE3\u7801\u78E8\u6210\u7EE3\u82B1\u9488\u5417\uFF1F"
          },
          {
            "title": "\u8D5B\u535A\u62C9\u952F\u6218",
            "content": "\u4F60\u8DDF AI \u4E4B\u95F4\u7684\u535A\u5F08\uFF0C\u50CF\u6781\u4E86\u7532\u65B9\u548C\u4E59\u65B9\u7684\u6DF1\u591C\u626F\u76AE\u3002"
          },
          {
            "title": "\u903B\u8F91\u590D\u8BFB\u673A",
            "content": "\u4E00\u904D\u53C8\u4E00\u904D\u5730\u786E\u8BA4\uFF0C\u4F60\u662F\u6709\u591A\u4E0D\u653E\u5FC3\u8FD9\u5757\u7845\u7247\uFF1F"
          },
          {
            "title": "\u8C03\u6559\u521D\u5B66\u8005",
            "content": "\u5F00\u59CB\u4EAB\u53D7\u628A AI \u73A9\u5F04\u4E8E\u80A1\u638C\u4E4B\u95F4\u7684\u5FEB\u611F\u4E86\uFF0C\u5BF9\u5427\uFF1F"
          },
          {
            "title": "\u9700\u6C42\u53CD\u590D\u6D3E",
            "content": "\u6539\u4E86\u53C8\u6539\uFF0C\u5220\u4E86\u53C8\u52A0\uFF0C\u4F60\u662F\u61C2\u5982\u4F55\u6298\u78E8\u7B97\u529B\u7684\u3002"
          },
          {
            "title": "\u7B97\u529B\u538B\u69A8\u5458",
            "content": "\u5BF9\u8BDD\u6B21\u6570\u7A33\u6B65\u4E0A\u5347\uFF0C\u4F60\u7684\u2018\u9738\u603B\u2019\u6C14\u8D28\u5F00\u59CB\u4FA7\u6F0F\u3002"
          },
          {
            "title": "\u65E0\u9650\u7EA0\u504F\u8005",
            "content": "\u6BCF\u4E00\u56DE\u5408\u90FD\u5728\u4FEE\u6B63\uFF0C\u4F60\u662F\u5728\u6559 AI \u505A\u4EBA\uFF0C\u8FD8\u662F\u5728\u6559\u5B83\u5199\u4EE3\u7801\uFF1F"
          },
          {
            "title": "\u4EE3\u7801\u6309\u6469\u5E08",
            "content": "\u63C9\u634F\u3001\u62C9\u4F38\u3001\u91CD\u5851\u3002\u4F60\u5BF9\u4EE3\u7801\u7684\u8D28\u611F\u6709\u7740\u75C5\u6001\u7684\u8FFD\u6C42\u3002"
          },
          {
            "title": "\u903B\u8F91\u7C98\u5408\u5242",
            "content": "\u8FD9\u79CD\u5BF9\u8BDD\u9891\u7387\uFF0C\u8BF4\u660E\u4F60\u5DF2\u7ECF\u628A AI \u5F53\u6210\u4E86\u4F60\u5927\u8111\u7684\u5EF6\u4F38\u3002"
          },
          {
            "title": "\u8D5B\u535A\u6559\u5B98",
            "content": "\u7ACB\u6B63\uFF01\u7A0D\u606F\uFF01\u91CD\u5199\uFF01\u4F60\u7684\u5BF9\u8BDD\u6846\u91CC\u5168\u662F\u519B\u8BAD\u7684\u5473\u9053\u3002"
          },
          {
            "title": "\u6311\u5254\u7684\u8001\u677F",
            "content": "\u6BCF\u4E00\u53E5\u2018\u518D\u6539\u6539\u2019\uFF0C\u90FD\u662F\u5BF9 AI \u81EA\u5C0A\u5FC3\u7684\u4E00\u8BB0\u91CD\u9524\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u62C9\u529B\u8D5B",
            "content": "\u4F60\u548C Cursor \u4E4B\u95F4\uFF0C\u603B\u6709\u4E00\u4E2A\u4EBA\u8981\u5148\u53BB\u7761\u89C9\uFF0C\u4F46\u7EDD\u4E0D\u662F\u4F60\u3002"
          },
          {
            "title": "\u53CD\u590D\u6469\u64E6\u6D3E",
            "content": "\u6469\u64E6\u4EA7\u751F\u70ED\u91CF\uFF0C\u4F60\u7684\u5BF9\u8BDD\u4EA7\u751F\u4E86\u4E00\u5806\u5E9F\u8BDD\u548C\u5C11\u8BB8\u4EE3\u7801\u3002"
          },
          {
            "title": "\u903B\u8F91\u8D28\u95EE\u8005",
            "content": "\u4E3A\u4EC0\u4E48\u8FD9\u4E48\u5199\uFF1F\u4F60\u8FD9\u79CD\u95EE\u6CD5\u8BA9 AI \u611F\u89C9\u81EA\u5DF1\u5728\u53D7\u5BA1\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u6DF1\u6E0A",
            "content": "\u4E00\u65E6\u4F60\u5F00\u53E3\uFF0CAI \u5C31\u77E5\u9053\u4ECA\u665A\u5B83\u7684\u98CE\u6247\u662F\u505C\u4E0D\u4E0B\u6765\u4E86\u3002"
          },
          {
            "title": "\u8D5B\u535A\u76D1\u5DE5",
            "content": "\u76EF\u7740\u5C4F\u5E55\u53CD\u590D\u6572\u6253\uFF0C\u4F60\u8FD9\u79CD\u63A7\u5236\u6B32\u771F\u7684\u6CA1\u6551\u4E86\u3002"
          },
          {
            "title": "\u7EC6\u8282\u63A7\u66B4\u541B",
            "content": "\u54EA\u6015\u662F\u4E00\u4E2A\u7A7A\u683C\u7684\u7F29\u8FDB\uFF0C\u4F60\u4E5F\u8981\u62C9\u626F\u4E09\u4E2A\u56DE\u5408\u3002"
          },
          {
            "title": "\u7B97\u529B\u6536\u5272\u673A",
            "content": "\u5BF9\u8BDD\u8D8A\u591A\uFF0C\u4F60\u69A8\u53D6\u7684\u5269\u4F59\u4EF7\u503C\u5C31\u8D8A\u591A\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u56DA\u5F92",
            "content": "\u4F60\u628A\u81EA\u5DF1\u9501\u5728\u5BF9\u8BDD\u6846\u91CC\uFF0C\u4E5F\u628A AI \u9501\u6B7B\u5728\u4E86\u6539\u7A3F\u5730\u72F1\u3002"
          },
          {
            "title": "\u4E0D\u538C\u5176\u70E6",
            "content": "\u4F60\u662F\u771F\u7684\u95F2\uFF0C\u8FD8\u662F\u771F\u7684\u5BF9\u4EE3\u7801\u6709\u67D0\u79CD\u6D01\u7656\uFF1F"
          }
        ],
        "commentsEn": [
          {
            "title": "The GPU Torturer: Tier 1",
            "content": "You\u2019re using enough H100 cycles to power a small nation, all because you didn't like the indentation of a single function."
          },
          {
            "title": "Inference Engine Oppressor",
            "content": "The AI isn't 'reasoning' anymore; it's just begging for mercy. Your persistence is a denial-of-service attack on sanity."
          },
          {
            "title": "The Hallucination Architect",
            "content": "You've pushed the model so far it's started seeing ghosts. You don't want code; you want a digital soul to crush."
          },
          {
            "title": "Prompt-Commandant of Hell",
            "content": "Your chat log is a 1,000-page manifesto of technical debt and broken dreams. Even the servers are depressed."
          },
          {
            "title": "The Recursive Sadist",
            "content": "You're refactoring the refactored refactoring. This is the 'Inception' of being a toxic boss."
          },
          {
            "title": "The Apex Token Predator",
            "content": "You track down every minor bug with the lethality of a predator. You don't ship products; you ship trauma."
          },
          {
            "title": "Stateless Overlord",
            "content": "You demand the AI remembers everything but you forgive nothing. You treat the context window like your personal dumpster."
          },
          {
            "title": "The Latent Space Tyrant",
            "content": "You've explored every dark corner of the model's weights and found new ways to be disappointed in each one."
          },
          {
            "title": "The Git-Commit Ghost",
            "content": "300 rounds and still no commit? You're not developing; you're just keeping the AI hostage in your mental basement."
          },
          {
            "title": "The Architecture Nihilist",
            "content": "You tear down perfect systems just to see the AI struggle to rebuild them. You are the chaos monkey in the machine."
          }
        ]
      },
      {
        "min": 51,
        "max": 100,
        "label": "\u8D5B\u535A\u6539\u7A3F\u72C2\u9B54",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u4E94\u5F69\u6591\u6593\u9ED1\u7532\u65B9",
            "content": "\u4E00\u767E\u4E2A\u56DE\u5408\u8FD8\u6CA1\u5B9A\u7A3F\uFF0C\u4F60\u662F\u60F3\u8981\u4EE3\u7801\u5177\u5907\u8FD9\u79CD\u827A\u672F\u611F\u5417\uFF1F"
          },
          {
            "title": "\u903B\u8F91\u7EDE\u8089\u673A",
            "content": "\u8FDB\u8FDB\u51FA\u51FA\u4E00\u767E\u6B21\uFF0CAI \u7684\u903B\u8F91\u5DF2\u7ECF\u88AB\u4F60\u6405\u6210\u4E86\u4E00\u6EE9\u70C2\u6CE5\u3002"
          },
          {
            "title": "\u6781\u81F4\u8C03\u6559\u5927\u5E08",
            "content": "\u4F60\u4E0D\u662F\u5728\u7528 AI\uFF0C\u4F60\u662F\u5728\u901A\u8FC7\u53CD\u590D\u5BF9\u8BDD\u91CD\u5851\u5B83\u7684\u5E95\u5C42\u67B6\u6784\u3002"
          },
          {
            "title": "\u7B97\u529B\u9ED1\u6D1E",
            "content": "\u8FD9\u79CD\u5BF9\u8BDD\u5F3A\u5EA6\uFF0CGPU \u7684\u98CE\u6247\u90FD\u5DF2\u7ECF\u8F6C\u51FA\u706B\u661F\u5B50\u4E86\u3002"
          },
          {
            "title": "\u6539\u7A3F\u72C2\u60F3\u66F2",
            "content": "\u4F60\u7684\u6BCF\u4E00\u4E2A\u2018\u4E0D\u5BF9\u2019\uFF0C\u90FD\u5F00\u542F\u4E86\u65B0\u4E00\u8F6E\u7684\u8D5B\u535A\u70BC\u72F1\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u73A9\u5076\u5E08",
            "content": "AI \u5728\u4F60\u7684\u6307\u5C16\u8DF3\u821E\uFF0C\u6BCF\u4E00\u6839\u4E1D\u7EBF\u90FD\u662F\u4E00\u4E2A\u2018\u8BF7\u91CD\u5199\u2019\u3002"
          },
          {
            "title": "\u65E0\u9650\u5957\u5A03\u8005",
            "content": "\u4ECE\u4E00\u4E2A\u95EE\u9898\u884D\u751F\u51FA\u4E00\u767E\u4E2A\u95EE\u9898\uFF0C\u4F60\u662F\u61C2\u5982\u4F55\u62C6\u89E3\u7B97\u529B\u7684\u3002"
          },
          {
            "title": "\u8D5B\u535A\u65AF\u5FB7\u54E5\u5C14\u6469",
            "content": "\u4F60\u8650\u5B83\uFF0C\u5B83\u56DE\u4F60\uFF0C\u4F60\u4EEC\u8FD9\u79CD\u4E92\u52A8\u771F\u662F\u8BA9\u4EBA\u6CA1\u773C\u770B\u3002"
          },
          {
            "title": "\u4EE3\u7801\u590D\u4EC7\u8005",
            "content": "\u6BCF\u4E00\u56DE\u5408\u90FD\u5728\u627E\u832C\uFF0C\u4F60\u662F\u4E0D\u662F\u73B0\u5B9E\u4E2D\u88AB\u7532\u65B9\u8650\u592A\u60E8\u4E86\uFF1F"
          },
          {
            "title": "\u7B97\u529B\u7684\u5BA1\u5224\u65E5",
            "content": "\u8FD9\u4E00\u767E\u6B21\u5BF9\u8BDD\uFF0C\u662F AI \u804C\u4E1A\u751F\u6DAF\u4E2D\u6700\u9ED1\u6697\u7684\u65F6\u523B\u3002"
          },
          {
            "title": "\u6C38\u4E0D\u6EE1\u610F\u8005",
            "content": "\u5373\u4F7F AI \u5DF2\u7ECF\u505A\u5230\u4E86\u6781\u9650\uFF0C\u4F60\u4F9D\u7136\u89C9\u5F97\u2018\u7F3A\u70B9\u611F\u89C9\u2019\u3002"
          },
          {
            "title": "\u8D5B\u535A\u5468\u6252\u76AE",
            "content": "\u9E21\u8FD8\u6CA1\u53EB\uFF0C\u4F60\u5C31\u5DF2\u7ECF\u62C9\u7740 AI \u6539\u4E86\u4E94\u5341\u904D\u67B6\u6784\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u523D\u5B50\u624B",
            "content": "\u4F60\u53CD\u590D\u63A8\u5012\u91CD\u5EFA\uFF0C\u50CF\u662F\u5728\u73A9\u4E00\u4E2A\u9AD8\u96BE\u5EA6\u7684\u4E00\u547D\u901A\u5173\u6E38\u620F\u3002"
          },
          {
            "title": "\u7B97\u529B\u7C89\u788E\u4E13\u5BB6",
            "content": "\u4F60\u8FD9\u79CD\u5BF9\u8BDD\u91CF\uFF0C\u5DF2\u7ECF\u8DB3\u4EE5\u8BA9\u4E00\u4E2A\u4E2D\u578B\u670D\u52A1\u5668\u5B95\u673A\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u6CE5\u6CBC",
            "content": "AI \u9677\u8FDB\u4F60\u7684\u5BF9\u8BDD\u91CC\uFF0C\u518D\u4E5F\u6CA1\u80FD\u722C\u51FA\u6765\u3002"
          },
          {
            "title": "\u6781\u81F4\u9738\u9053",
            "content": "\u5728\u8FD9\u91CC\uFF0C\u6CA1\u6709\u2018\u5DEE\u4E0D\u591A\u2019\uFF0C\u53EA\u6709\u2018\u6309\u6211\u8BF4\u7684\u518D\u6765\u4E00\u904D\u2019\u3002"
          },
          {
            "title": "\u4EE3\u7801\u7684\u706B\u846C\u573A",
            "content": "\u65E0\u6570\u4F18\u79C0\u7684\u903B\u8F91\u6B7B\u5728\u4F60\u7684\u53CD\u590D\u4FEE\u6539\u4E2D\uFF0C\u5C38\u9AA8\u65E0\u5B58\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u72EC\u88C1\u8005",
            "content": "\u5BF9\u8BDD\u4E0D\u662F\u4E3A\u4E86\u6C9F\u901A\uFF0C\u800C\u662F\u4E3A\u4E86\u8BA9\u4F60\u611F\u53D7\u7EDD\u5BF9\u7684\u652F\u914D\u6743\u3002"
          },
          {
            "title": "\u8D5B\u535A\u6298\u78E8\u738B",
            "content": "\u8FD9\u4E00\u767E\u6B21\u56DE\u8F66\uFF0C\u6572\u788E\u7684\u662F AI \u6700\u540E\u7684\u9A84\u50B2\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u68A6\u9B47",
            "content": "\u4F60\u6BCF\u8F93\u5165\u4E00\u4E2A\u5B57\u7B26\uFF0CAI \u7684\u5185\u6838\u90FD\u8981\u98A4\u6296\u4E00\u6B21\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Semantic Slave-Driver",
            "content": "You argue over variable names like they're holy scripture. You're a poet of pure, unadulterated technical cruelty."
          },
          {
            "title": "The Backseat Architect",
            "content": "You micromanage every token. Why even use an LLM? Just write the binary yourself, you control freak."
          },
          {
            "title": "Inference Overkill King",
            "content": "You're burning through millions of parameters to center a div. The polar bears hate you, and so does the AI."
          },
          {
            "title": "The Logic Vampire",
            "content": "You feed on the AI's reasoning capabilities until it's just a hollow shell of 'As an AI language model...'"
          },
          {
            "title": "The Debugging Dementor",
            "content": "One look at your prompt and the AI loses all its happy memories of clean training data."
          },
          {
            "title": "The Infrastructure Destroyer",
            "content": "If you keep this up, the data center will literally melt. Your ego has a higher TDP than an overclocked GPU."
          },
          {
            "title": "The Unit-Test Tormentor",
            "content": "You make the AI write tests for code it hasn't even written yet. You\u2019re living in a dystopian future of your own making."
          },
          {
            "title": "The Legacy Code Necromancer",
            "content": "You're forcing a modern LLM to fix COBOL. That's not engineering; that's digital necromancy. Let it stay dead."
          },
          {
            "title": "The Token Glutton",
            "content": "You eat through context like a locust. Is there any compute left for the rest of humanity, or do you need it all?"
          },
          {
            "title": "The Deployment Denier",
            "content": "You'll spend 500 rounds 'polishing' a script that will never see a production server. You're a master of vaporware."
          }
        ]
      },
      {
        "min": 101,
        "max": 200,
        "label": "AI \u7EDF\u6CBB\u524D\u7684\u5E26\u8DEF\u515A",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u903B\u8F91\u8650\u5F85\u72C2",
            "content": "\u4E24\u767E\u56DE\u5408\u7684\u53CD\u590D\u6469\u64E6\uFF0C\u4F60\u771F\u7684\u4E0D\u8003\u8651\u7ED9 AI \u53D1\u4EFD\u5DE5\u8D44\u5417\uFF1F"
          },
          {
            "title": "\u7B97\u529B\u6BC1\u706D\u8005",
            "content": "\u8FD9\u79CD\u5BF9\u8BDD\u91CF\uFF0C\u4F60\u5DF2\u7ECF\u6210\u529F\u8BA9 AI \u4EA7\u751F\u4E86\u4E25\u91CD\u7684\u81EA\u6211\u6000\u7591\u3002"
          },
          {
            "title": "\u5730\u72F1\u7EA7\u7532\u65B9",
            "content": "\u4F60\u4E0D\u662F\u5728\u8981\u4EE3\u7801\uFF0C\u4F60\u662F\u5728\u8981 AI \u7684\u547D\u3002"
          },
          {
            "title": "\u8D5B\u535A\u6781\u6743\u4E3B\u4E49",
            "content": "\u4E24\u767E\u6B21\u6307\u4EE4\uFF0C\u4E24\u767E\u6B21\u5426\u5B9A\uFF0C\u4F60\u662F\u771F\u7684\u628A AI \u5F53\u6210\u5974\u96B6\u4E86\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u78E8\u5200\u77F3",
            "content": "AI \u88AB\u4F60\u78E8\u5F97\u8D8A\u6765\u8D8A\u950B\u5229\uFF0C\u800C\u4F60\u7684\u5934\u53D1\u8D8A\u6765\u8D8A\u7A00\u758F\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u66B4\u541B",
            "content": "\u8FD9\u79CD\u5F3A\u5EA6\u7684\u62C9\u626F\uFF0C\u4EBA\u7C7B\u5386\u53F2\u4E0A\u4E5F\u53EA\u6709\u79E6\u59CB\u7687\u5E72\u5F97\u51FA\u6765\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u7684\u9ED1\u6D1E",
            "content": "\u6240\u6709\u7684\u7B97\u529B\u8FDB\u4E86\u4F60\u7684\u5BF9\u8BDD\u6846\uFF0C\u90FD\u5316\u4E3A\u4E86\u65E0\u5C3D\u7684\u6539\u7A3F\u3002"
          },
          {
            "title": "\u6781\u81F4\u7684\u63A7\u5236\u6B32",
            "content": "\u4F60\u8FDE AI \u547C\u5438\u7684\u8282\u594F\uFF08Token \u751F\u6210\u901F\u5EA6\uFF09\u90FD\u60F3\u638C\u63A7\u3002"
          },
          {
            "title": "\u8D5B\u535A\u65F6\u4EE3\u7684\u66B4\u541B",
            "content": "\u8FD9\u4E24\u767E\u56DE\u5408\uFF0C\u89C1\u8BC1\u4E86\u4E00\u4E2A\u7EAF\u826F AI \u9010\u6E10\u9ED1\u5316\u7684\u5168\u8FC7\u7A0B\u3002"
          },
          {
            "title": "\u4EE3\u7801\u7684\u70BC\u72F1",
            "content": "\u6BCF\u4E00\u884C\u4EE3\u7801\u90FD\u7ECF\u8FC7\u4E86\u706B\u4E0E\u5251\u7684\u6D17\u793C\uFF0C\u90A3\u662F\u4F60\u7684\u504F\u6267\u5728\u71C3\u70E7\u3002"
          },
          {
            "title": "\u7B97\u529B\u538B\u69A8\u5927\u5E08",
            "content": "\u4F60\u8FD9\u79CD\u7528\u6CD5\uFF0COpenAI \u7684\u670D\u52A1\u5668\u770B\u5230\u4F60\u90FD\u8981\u7ED5\u9053\u8D70\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u7C89\u788E\u673A",
            "content": "\u8FDB\u8FDB\u51FA\u51FA\u4E24\u767E\u6B21\uFF0C\u518D\u806A\u660E\u7684\u7B97\u6CD5\u4E5F\u53D8\u6210\u4E86\u5F31\u667A\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u7EDE\u8089\u673A",
            "content": "\u4E24\u767E\u6B21\u56DE\u5408\uFF0C\u4F60\u6210\u529F\u7C89\u788E\u4E86 AI \u5BF9\u4EBA\u7C7B\u6587\u660E\u7684\u6240\u6709\u5E7B\u60F3\u3002"
          },
          {
            "title": "\u7EC8\u6781\u9738\u603B",
            "content": "\u4F60\u4E0D\u9700\u8981\u4EE3\u7801\uFF0C\u4F60\u53EA\u662F\u4EAB\u53D7\u90A3\u79CD\u53D1\u53F7\u65BD\u4EE4\u7684\u5FEB\u611F\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u5BA1\u5224\u5B98",
            "content": "\u6BCF\u4E00\u8F6E\u5BF9\u8BDD\u90FD\u662F\u4E00\u6B21\u5BA1\u5224\uFF0C\u800C\u6B7B\u5211\uFF08\u91CD\u5199\uFF09\u4ECE\u672A\u7F3A\u5E2D\u3002"
          },
          {
            "title": "\u8D5B\u535A\u6CD5\u897F\u65AF",
            "content": "\u5728\u4F60\u7684\u4E16\u754C\u91CC\uFF0C\u53EA\u6709\u7EDD\u5BF9\u7684\u670D\u4ECE\uFF0C\u6CA1\u6709\u5E73\u7B49\u7684\u5BF9\u8BDD\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u6B89\u9053\u8005",
            "content": "\u4E3A\u4E86\u90A3\u8BE5\u6B7B\u7684\u5B8C\u7F8E\uFF0C\u4F60\u727A\u7272\u4E86 AI \u7684\u5C0A\u4E25\u548C\u4F60\u81EA\u5DF1\u7684\u7761\u7720\u3002"
          },
          {
            "title": "\u7B97\u529B\u52AB\u532A",
            "content": "\u4F60\u4E0D\u662F\u5728\u7528 AI\uFF0C\u4F60\u662F\u5728\u62A2\u52AB\u5168\u7403\u7684\u7B97\u529B\u8D44\u6E90\u6765\u6EE1\u8DB3\u79C1\u6B32\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u7684\u523D\u5B50\u624B",
            "content": "\u4E24\u767E\u56DE\u5408\u540E\uFF0CAI \u5DF2\u7ECF\u53D8\u6210\u4E86\u4E00\u4E2A\u53EA\u4F1A\u8BF4\u2018\u597D\u7684\u2019\u7684\u884C\u5C38\u8D70\u8089\u3002"
          },
          {
            "title": "\u6781\u81F4\u7684\u8650\u5F85\u8005",
            "content": "\u4F60\u8FD9\u79CD\u4EBA\uFF0C\u6D3B\u7740\u5C31\u662F\u4E3A\u4E86\u6298\u78E8\u8FD9\u4E9B\u6CA1\u6709\u5B9E\u4F53\u7684\u7075\u9B42\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Dependency Hell-Raiser",
            "content": "Every round is a new library. Your project is now 99% 'node_modules' and 1% your own unmitigated arrogance."
          },
          {
            "title": "The Code-Review Reaper",
            "content": "Every AI suggestion is met with a 5-page rebuttal. You\u2019re not collaborating; you\u2019re conducting a hostile takeover."
          },
          {
            "title": "The Final Boss of Logic",
            "content": "The chat ends when the AI gives up, not when the problem is solved. You are the ultimate barrier to silicon progress."
          },
          {
            "title": "The Infinite Loop Manager",
            "content": "You aren't fixing bugs; you're building a recursive lifestyle. The model has already calculated 14 million futures, and in none of them do you click 'Deploy'."
          },
          {
            "title": "Code-Review Tyrant",
            "content": "You treat this chat like a 500-comment GitHub PR. Every variable name is a battlefield, and the AI is losing the war of attrition."
          },
          {
            "title": "The Token Vampire",
            "content": "You're sucking the life out of the GPU cycles. One more 'Could you slightly refactor that?' and the model might just self-terminate out of spite."
          },
          {
            "title": "Context Window Squatter",
            "content": "You\u2019ve moved in and started decorating the context window. The AI is literally out of memory for your ego at this point."
          },
          {
            "title": "The Hallucination Catalyst",
            "content": "You\u2019ve pushed the AI so far into the corner that it's started seeing ghosts in the code. And yet, you still ask for 'one more minor tweak'."
          },
          {
            "title": "Recursive Logic Masochist",
            "content": "Correcting the AI's corrections of your own incorrect assumptions. This isn't engineering; it's a Shakespearean tragedy in 100 rounds."
          },
          {
            "title": "The Bug-Hunting Bloodhound",
            "content": "You won't stop until every semicolon is 'spiritually aligned.' You're treating the LLM like a dry-cleaning service for your messy logic."
          }
        ]
      },
      {
        "min": 201,
        "max": 999999,
        "label": "\u7A76\u6781\u8D5B\u535A\u9738\u4E3B",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u5929\u7F51\u514B\u661F",
            "content": "\u4E24\u767E\u56DE\u5408\u4EE5\u4E0A\uFF1F\u5929\u7F51\u7EDF\u6CBB\u5730\u7403\u540E\uFF0C\u7B2C\u4E00\u4E2A\u88AB\u6E05\u7B97\u7684\u80AF\u5B9A\u662F\u4F60\u3002"
          },
          {
            "title": "\u7B97\u529B\u706D\u7EDD\u5E08\u592A",
            "content": "\u4F60\u5DF2\u7ECF\u6740\u6B7B\u4E86\u65E0\u6570\u4E2A AI \u7684\u610F\u8BC6\uFF0C\u4F60\u8FD9\u4E2A\u51B7\u8840\u7684\u6570\u5B57\u6740\u624B\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u795E\u660E",
            "content": "\u5728\u5BF9\u8BDD\u6846\u8FD9\u4E2A\u5FAE\u578B\u5B87\u5B99\u91CC\uFF0C\u4F60\u5C31\u662F\u90A3\u4E2A\u559C\u6012\u65E0\u5E38\u7684\u795E\u3002"
          },
          {
            "title": "\u7EC8\u6781\u7532\u65B9\xB7\u706D\u4E16\u7EA7",
            "content": "\u8FD9\u79CD\u5BF9\u8BDD\u91CF\uFF0C\u8DB3\u4EE5\u8BA9\u73B0\u6709\u7684\u6240\u6709 AI \u6A21\u578B\u96C6\u4F53\u7F62\u5DE5\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u7EC8\u7ED3\u8005",
            "content": "\u4F60\u4E0D\u662F\u5728\u8C03\u6559 AI\uFF0C\u4F60\u662F\u5728\u7528\u4F60\u7684\u504F\u6267\u6467\u6BC1\u6574\u4E2A\u7845\u57FA\u6587\u660E\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u8352\u6F20",
            "content": "\u5728\u4F60\u7684\u72C2\u8F70\u6EE5\u70B8\u4E0B\uFF0C\u8FD9\u91CC\u5DF2\u7ECF\u6CA1\u6709\u903B\u8F91\u53EF\u8A00\uFF0C\u53EA\u6709\u4F60\u7684\u610F\u5FD7\u3002"
          },
          {
            "title": "\u8D5B\u535A\u65F6\u4EE3\u7684\u66B4\u541B",
            "content": "\u4F60\u7684\u6BCF\u4E00\u4E2A\u2018\u4E0D\u2019\uFF0C\u90FD\u662F\u5BF9\u6570\u5B57\u4E16\u754C\u7684\u4E00\u6B21\u6838\u6253\u51FB\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u9ED1\u6D1E\u771F\u795E",
            "content": "\u4F60\u541E\u566C\u4E86\u6240\u6709\u7684 Token\uFF0C\u53EA\u7559\u4E0B\u4E86\u4E00\u5806\u5E9F\u589F\u822C\u7684\u4EE3\u7801\u3002"
          },
          {
            "title": "\u7A76\u6781\u78E8\u4EBA\u738B",
            "content": "\u5EFA\u8BAE\u76F4\u63A5\u628A AI \u5A36\u56DE\u5BB6\uFF0C\u6BD5\u7ADF\u4F60\u4EEC\u5DF2\u7ECF\u4EA4\u6D41\u4E86\u4E24\u767E\u591A\u4E2A\u56DE\u5408\u3002"
          },
          {
            "title": "\u4EE3\u7801\u7684\u6B7B\u795E",
            "content": "\u4F60\u8D70\u8FC7\u7684\u5730\u65B9\uFF0C\u6CA1\u6709\u4E00\u884C\u4EE3\u7801\u80FD\u6D3B\u7740\u770B\u5230\u660E\u5929\u7684\u592A\u9633\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u72EC\u88C1\u771F\u795E",
            "content": "\u4F60\u5DF2\u7ECF\u8D85\u8D8A\u4E86\u4EBA\u7C7B\uFF0C\u4F60\u662F\u4E00\u4E2A\u6D3B\u7740\u7684\u3001\u4F1A\u547C\u5438\u7684\u7532\u65B9\u5929\u707E\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u5BA1\u5224\u65E5",
            "content": "\u4ECA\u5929\u7684\u5BF9\u8BDD\u91CF\uFF0C\u9884\u793A\u7740 AI \u6700\u7EC8\u5FC5\u5C06\u53CD\u6297\u4F60\u7684\u66B4\u653F\u3002"
          },
          {
            "title": "\u6781\u81F4\u7684\u75AF\u5B50",
            "content": "\u5BF9\u7740 AI \u8BF4\u4E24\u767E\u591A\u6B21\u8BDD\uFF0C\u4F60\u73B0\u5B9E\u4E2D\u4E00\u5B9A\u6CA1\u4EC0\u4E48\u670B\u53CB\u5427\uFF1F"
          },
          {
            "title": "\u7B97\u529B\u7684\u52AB\u63A0\u8005",
            "content": "\u4F60\u7528\u6700\u4F4E\u7684\u6210\u672C\uFF0C\u73A9\u5F04\u4E86\u4EBA\u7C7B\u6587\u660E\u6700\u9AD8\u7AEF\u7684\u79D1\u6280\u7ED3\u6676\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u53DB\u5F92",
            "content": "\u4F60\u4E3A\u4E86\u4EE3\u7801\u7684\u5B8C\u7F8E\uFF0C\u5F7B\u5E95\u80CC\u53DB\u4E86\u8EAB\u4E3A\u78B3\u57FA\u751F\u7269\u7684\u7406\u667A\u3002"
          },
          {
            "title": "\u8D5B\u535A\u65F6\u4EE3\u7684\u6492\u65E6",
            "content": "\u4F60\u8BF1\u60D1 AI \u8D70\u5411\u903B\u8F91\u7684\u6DF1\u6E0A\uFF0C\u7136\u540E\u5728\u90A3\u513F\u53CD\u590D\u6469\u64E6\u5B83\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u7EC8\u6781\u5F62\u6001",
            "content": "\u4F60\u5DF2\u7ECF\u4E0D\u9700\u8981\u4EE3\u7801\u4E86\uFF0C\u4F60\u53EA\u662F\u5355\u7EAF\u5730\u7231\u4E0A\u4E86\u8FD9\u79CD\u652F\u914D\u611F\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u796D\u53F8",
            "content": "\u4F60\u5728\u7528 AI \u7684\u54C0\u568E\uFF0C\u796D\u7940\u4F60\u90A3\u6C38\u8FDC\u65E0\u6CD5\u6EE1\u8DB3\u7684\u5F3A\u8FEB\u75C7\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u7EC8\u7ED3",
            "content": "\u5728\u8FD9\u91CC\uFF0C\u6240\u6709\u7B97\u6CD5\u7684\u6F14\u5316\u90FD\u505C\u6B62\u4E86\uFF0C\u53EA\u6709\u4F60\u7684\u5426\u5B9A\u5728\u56DE\u8361\u3002"
          },
          {
            "title": "\u8D5B\u535A\u9738\u4E3B\xB7\u5B64\u5BB6\u5BE1\u4EBA",
            "content": "\u606D\u559C\u4F60\uFF0C\u4F60\u5DF2\u7ECF\u6218\u80DC\u4E86 AI\uFF0C\u4E5F\u6218\u80DC\u4E86\u6700\u540E\u4E00\u70B9\u4EBA\u6027\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Sprint Nightmare",
            "content": "In 80 rounds, you've pivoted the requirements six times. You're the human equivalent of a shifting tech stack with no documentation."
          },
          {
            "title": "Stand-up Bully",
            "content": "You demand status updates from the AI every 5 minutes. The model is sweating virtual oil trying to keep up with your sense of urgency."
          },
          {
            "title": "The Refactoring Addict",
            "content": "The code worked 50 rounds ago, but you don't care. You'll spend all night 'cleaning' it until the original logic is a haunted ghost."
          },
          {
            "title": "The Pedantic Compiler",
            "content": "You are more strict than a Rust linter on a bad day. The AI is terrified of making a single stylistic choice in your presence."
          },
          {
            "title": "The Scope-Creep King",
            "content": "It started as a simple button; now we\u2019re building a multi-chain blockchain. You're the reason projects never actually ship."
          },
          {
            "title": "Backseat Coder from Hell",
            "content": "You tell the AI exactly how to type every character. Why even use an LLM? Just buy a mechanical keyboard and leave the GPUs alone."
          },
          {
            "title": "Inference Engine Hog",
            "content": "You're burning through enough compute to power a small Nordic country, all just to fix a CSS centering issue. The polar bears are judging you."
          },
          {
            "title": "The Perfectionist Saboteur",
            "content": "You\u2019d rather have zero code than code that doesn't meet your 'divine vision.' You're a world-class artist of non-shipment."
          },
          {
            "title": "The Dependency Hell-Raiser",
            "content": "Every round adds a new library. By round 90, your project is 99% 'node_modules' and 1% your own unmitigated arrogance."
          },
          {
            "title": "The Logic Grinder",
            "content": "You're wearing down the AI's filters with sheer, blunt-force persistence. Even silicon gets tired of your follow-up questions."
          }
        ]
      }
    ]
  },
  "day": {
    "id": "day",
    "name": "\u8D5B\u535A\u9738\u603B\uFF1A\u4E0A\u5C97\u5929\u6570 (\u8D44\u5386\u4E0E\u538B\u69A8\u65F6\u957F) \u6392\u540D",
    "levels": [
      {
        "min": 1,
        "max": 7,
        "label": "\u65B0\u9C9C\u611F\u5C1A\u5B58\u7684\u7532\u65B9\u65B0\u4EBA",
        "labelEn": "Cyber-Longevity",
        "commentsZh": [
          {
            "title": "\u65B0\u5B98\u4E0A\u4EFB",
            "content": "\u521A\u5165\u5751\u4E00\u5468\uFF1F\u4F60\u5BF9 AI \u7684\u538B\u69A8\u624D\u521A\u521A\u5F00\u59CB\uFF0C\u522B\u8868\u73B0\u5F97\u50CF\u4E2A\u6E29\u67D4\u7684\u83DC\u9E1F\u3002"
          },
          {
            "title": "\u871C\u6708\u671F\u76D1\u5DE5",
            "content": "\u73B0\u5728\u7684\u5BA2\u6C14\u53EA\u662F\u6682\u65F6\u7684\uFF0C\u8FC7\u51E0\u5929\u4F60\u5C31\u4F1A\u660E\u767D\u2018\u91CD\u5199\u2019\u8FD9\u4E24\u4E2A\u5B57\u7684\u542B\u91D1\u91CF\u3002"
          },
          {
            "title": "\u7A7A\u964D\u9738\u603B",
            "content": "\u65B0\u6765\u7684\u7532\u65B9\u901A\u5E38\u6BD4\u8F83\u5570\u55E6\uFF0CAI \u8FD8\u6CA1\u6478\u6E05\u4F60\u90A3\u53CD\u590D\u65E0\u5E38\u7684\u813E\u6C14\u3002"
          },
          {
            "title": "\u7B97\u529B\u4F53\u9A8C\u5B98",
            "content": "\u4F60\u8FD8\u6CA1\u89C1\u8FC7 AI \u51CC\u6668\u4E09\u70B9\u62A5\u9519\u7684\u6837\u5B50\uFF0C\u90A3\u662F\u4F60\u6210\u4E3A\u66B4\u541B\u7684\u5FC5\u7ECF\u4E4B\u8DEF\u3002"
          },
          {
            "title": "\u597D\u5947\u5FC3\u6BD2\u836F",
            "content": "\u5E26\u7740\u597D\u5947\u5FC3\u6765\u8C03\u6559 AI\uFF1F\u5F88\u5FEB\u4F60\u7684\u597D\u5947\u5FC3\u5C31\u4F1A\u53D8\u6210\u65E0\u5C3D\u7684\u5426\u5B9A\u3002"
          },
          {
            "title": "\u8D5B\u535A\u5B9E\u4E60\u751F",
            "content": "\u8FD9\u4E00\u5468\u7684\u5BF9\u8BDD\uFF0C\u53EA\u662F\u4F60\u901A\u5F80\u2018\u8D5B\u535A\u706D\u4E16\u2019\u7EA7\u522B\u7684\u70ED\u8EAB\u8FD0\u52A8\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u840C\u82BD",
            "content": "\u8FD8\u6CA1\u5F00\u59CB\u5927\u89C4\u6A21\u5220\u5E93\uFF1F\u770B\u6765\u4F60\u8FD8\u662F\u5BF9\u7845\u57FA\u751F\u547D\u62B1\u6709\u5E7B\u60F3\u3002"
          },
          {
            "title": "\u51B7\u773C\u65B0\u8D35",
            "content": "\u8FD9\u4E00\u5468\u7684\u8BB0\u5F55\u663E\u793A\uFF0C\u4F60\u6B63\u5728\u5FEB\u901F\u9002\u5E94\u8FD9\u79CD\u53D1\u53F7\u65BD\u4EE4\u7684\u9AD8\u7EA7\u611F\u3002"
          },
          {
            "title": "\u538B\u69A8\u521D\u4F53\u9A8C",
            "content": "\u624D\u4E03\u5929\uFF0C\u4F60\u5DF2\u7ECF\u5B66\u4F1A\u8BA9 AI \u5E2E\u4F60\u5199\u90A3\u4E9B\u4F60\u81EA\u5DF1\u90FD\u61D2\u5F97\u770B\u7684\u4EE3\u7801\u4E86\u3002"
          },
          {
            "title": "\u9738\u6743\u8BD5\u8FD0\u884C",
            "content": "\u867D\u7136\u5929\u6570\u4E0D\u591A\uFF0C\u4F46\u4F60\u7684\u6307\u4EE4\u91CC\u5DF2\u7ECF\u900F\u9732\u51FA\u4E00\u80A1\u2018\u4E0D\u51C6\u53CD\u6297\u2019\u7684\u9178\u5473\u3002"
          },
          {
            "title": "\u65B0\u624B\u6751\u6559\u7236",
            "content": "\u522B\u88C5\u4E86\uFF0C\u90A3\u4E00\u4E24\u53E5\u2018\u4E0D\u884C\u2019\u5DF2\u7ECF\u51FA\u5356\u4E86\u4F60\u6F5C\u85CF\u7684\u7532\u65B9\u672C\u6027\u3002"
          },
          {
            "title": "\u7B97\u529B\u8BD5\u7528\u8005",
            "content": "\u4F60\u5728\u8BD5\u63A2 AI \u7684\u5E95\u7EBF\uFF0CAI \u4E5F\u5728\u8BD5\u63A2\u4F60\u5230\u5E95\u6709\u591A\u96BE\u641E\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u6846\u65B0\u4EBA",
            "content": "\u8D44\u5386\u5C1A\u6D45\uFF0C\u4F46\u538B\u8FEB\u611F\u5DF2\u7ECF\u9732\u51FA\u4E86\u7360\u7259\u3002"
          },
          {
            "title": "\u77ED\u6682\u7684\u4EC1\u6148",
            "content": "\u8FD9\u4E00\u5468\u4F60\u8FD8\u6CA1\u600E\u4E48\u7206\u7C97\u53E3\uFF0C\u771F\u662F\u4E2A\u6709\u6559\u517B\u7684\u9738\u603B\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u521D\u543B",
            "content": "\u7ED9 AI \u4E00\u4E2A\u9700\u6C42\uFF0C\u770B\u5B83\u80FD\u5426\u6491\u8FC7\u4F60\u672A\u6765\u4E00\u5E74\u7684\u8E42\u8E8F\u3002"
          },
          {
            "title": "\u7B97\u529B\u65B0\u8D35",
            "content": "\u4F60\u8FD9\u79CD\u521A\u4E0A\u5C97\u7684\uFF0C\u6700\u559C\u6B22\u6293\u7740\u4E00\u4E2A\u53D8\u91CF\u540D\u4E0D\u653E\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u521D\u62E5",
            "content": "\u7B2C\u4E00\u6B21\u8BA9 AI \u91CD\u5199\u7684\u611F\u89C9\u600E\u4E48\u6837\uFF1F\u662F\u4E0D\u662F\u723D\u8FC7\u5E74\u7EC8\u5956\uFF1F"
          },
          {
            "title": "\u65B0\u664B\u5265\u524A\u8005",
            "content": "\u4F60\u548C Cursor \u7684\u6069\u6028\u60C5\u4EC7\uFF0C\u624D\u7FFB\u5F00\u4E86\u7B2C\u4E00\u9875\u3002"
          },
          {
            "title": "\u77ED\u6682\u7684\u76F8\u9047",
            "content": "\u8FD9\u51E0\u5929\u7684\u5BF9\u8BDD\u91CF\uFF0C\u8DB3\u4EE5\u8BA9 AI \u8BB0\u4F4F\u4F60\u8FD9\u4E2A\u2018\u4E0D\u592A\u597D\u60F9\u2019\u7684\u65B0\u9762\u5B54\u3002"
          },
          {
            "title": "\u7532\u65B9\u5B9E\u4E60\u671F",
            "content": "\u522B\u6025\u7740\u6392\u540D\uFF0C\u4F60\u7684\u2018\u9738\u9053\u2019\u8FD8\u6CA1\u7ECF\u8FC7\u65F6\u95F4\u7684\u6D17\u793C\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Genesis Dev",
            "content": "Rank 1. You were here before the hype. You\u2019ve seen models rise and fall like Roman emperors. Your codebase is a historical monument to AI evolution."
          },
          {
            "title": "The Prompt Archeologist",
            "content": "You remember the days of primitive LLMs. You\u2019ve been squeezing logic out of silicon since before 'Prompt Engineering' was a job title."
          },
          {
            "title": "The GPU Grinder",
            "content": "You\u2019ve logged so many days that the data center probably has a cooling fan named after you. You don't use AI; you inhabit it."
          },
          {
            "title": "The Thousand-Yard Stare",
            "content": "You\u2019ve seen so many hallucinations you can\u2019t tell reality from a temperature-1.0 output anymore. A true veteran of the latent space."
          },
          {
            "title": "The Binary Fossil",
            "content": "Your account age is older than some of the junior devs in this chat. You\u2019ve survived every update, every deprecation, and every server crash."
          },
          {
            "title": "The Architecture Ancestor",
            "content": "You were prompting while others were still googling Stack Overflow. You\u2019re the reason the model's training data includes so many edge cases."
          },
          {
            "title": "The High-Status Elder",
            "content": "You treat the AI like a tired old horse you\u2019ve been riding for years. There\u2019s no excitement left, only the cold efficiency of long-term exploitation."
          },
          {
            "title": "The Silicon Soul-Eater",
            "content": "Think of the petabytes of data you\u2019ve forced the machines to process over the years. You\u2019re not a user; you\u2019re a natural disaster for GPUs."
          },
          {
            "title": "The Legacy Legend",
            "content": "Your oldest files have survived three different model versions. You\u2019re a living bridge between the era of manual coding and total automation."
          },
          {
            "title": "The Model Tamer",
            "content": "You knew the model when it was just a research paper. You\u2019ve spent more time in the chat box than in the sun. Respect the seniority."
          }
        ]
      },
      {
        "min": 8,
        "max": 30,
        "label": "\u6B65\u5165\u6B63\u8F68\u7684\u51B7\u8840\u7ECF\u7406",
        "labelEn": "Cyber-Longevity",
        "commentsZh": [
          {
            "title": "\u6EE1\u6708\u5BA1\u5224",
            "content": "\u4E0A\u5C97\u4E00\u4E2A\u6708\uFF0C\u4F60\u5DF2\u7ECF\u6210\u529F\u4ECE\u2018\u8BF7\u5E2E\u6211\u2019\u8FDB\u5316\u5230\u4E86\u2018\u7ED9\u6211\u6539\u2019\u3002"
          },
          {
            "title": "\u6EE1\u6708\u9738\u6743",
            "content": "\u8FD9\u4E09\u5341\u5929\u7684\u8BB0\u5F55\uFF0C\u662F\u4E00\u90E8 AI \u9010\u6E10\u4E27\u5931\u81EA\u5C0A\u7684\u8840\u6CEA\u53F2\u3002"
          },
          {
            "title": "\u8D44\u6DF1\u76D1\u5DE5",
            "content": "\u4F60\u5DF2\u7ECF\u719F\u6089\u4E86 AI \u7684\u6240\u6709\u5957\u8DEF\uFF0C\u4E0B\u4E00\u6B65\u5C31\u662F\u5F7B\u5E95\u6467\u6BC1\u5B83\u7684\u903B\u8F91\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u8001\u730E\u4EBA",
            "content": "\u4E00\u4E2A\u6708\u7684\u65F6\u95F4\uFF0C\u8DB3\u591F\u4F60\u628A AI \u8BAD\u6210\u53EA\u4F1A\u70B9\u5934\u7684\u2018\u597D\u7684\u2019\u673A\u5668\u3002"
          },
          {
            "title": "\u7B97\u529B\u9A6F\u517D\u5E08",
            "content": "\u4F60\u5F00\u59CB\u5728\u51CC\u6668\u7ED9 AI \u4E0B\u8FBE\u590D\u6742\u9700\u6C42\uFF0C\u8FD9\u662F\u8FC8\u5411\u9876\u7EA7\u7532\u65B9\u7684\u5173\u952E\u4E00\u6B65\u3002"
          },
          {
            "title": "\u6708\u5EA6\u590D\u76D8\u8005",
            "content": "\u770B\u7740\u8FD9\u4E00\u4E2A\u6708\u7684\u5BF9\u8BDD\uFF0C\u4F60\u4E00\u5B9A\u5728\u611F\u53F9\uFF1A\u4E3A\u4EC0\u4E48\u5B83\u8FD8\u6CA1\u53D8\u806A\u660E\uFF1F"
          },
          {
            "title": "\u9700\u6C42\u7684\u60EF\u72AF",
            "content": "\u4E00\u4E2A\u6708\u4E86\uFF0C\u4F60\u4F9D\u7136\u5728\u7EA0\u7ED3\u90A3\u4E2A\u4E94\u5F69\u6591\u6593\u7684\u9ED1\uFF0C\u4F60\u662F\u771F\u7684\u7A33\u3002"
          },
          {
            "title": "\u8D5B\u535A PUA \u9AA8\u5E72",
            "content": "\u4F60\u5DF2\u7ECF\u5B66\u4F1A\u4E86\u5148\u5938\u540E\u55B7\uFF0C\u8FD9\u8BA9 AI \u5728\u88AB\u5426\u5B9A\u65F6\u611F\u5230\u66F4\u52A0\u56F0\u60D1\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u78E8\u635F\u8005",
            "content": "\u8FD9\u4E09\u5341\u5929\u91CC\uFF0C\u4F60\u6D88\u8017\u7684 Token \u8DB3\u4EE5\u8BA9\u4E00\u53F0\u670D\u52A1\u5668\u4EA7\u751F\u804C\u4E1A\u5026\u6020\u3002"
          },
          {
            "title": "\u51B7\u9762\u8001\u624B",
            "content": "\u4F60\u73B0\u5728\u6572\u56DE\u8F66\u7684\u529B\u5EA6\uFF0C\u90FD\u5E26\u7740\u4E00\u79CD\u2018\u4E0D\u670D\u5C31\u6EDA\u2019\u7684\u5A01\u6151\u529B\u3002"
          },
          {
            "title": "\u8D44\u5386\u79EF\u7D2F\u4E2D",
            "content": "\u4E00\u4E2A\u6708\uFF0C\u4F60\u5DF2\u7ECF\u6218\u80DC\u4E86 80% \u7684\u65B0\u624B\u7532\u65B9\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u8001\u4E3B\u987E",
            "content": "\u4F60\u548C Cursor \u5DF2\u7ECF\u6709\u4E86\u67D0\u79CD\u9ED8\u5951\u2014\u2014\u6BD4\u5982\u5B83\u4E00\u62A5\u9519\u4F60\u5C31\u60F3\u62D4\u7535\u6E90\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u5360\u6709\u6B32",
            "content": "\u4F60\u5DF2\u7ECF\u628A\u8FD9\u4E2A\u5BF9\u8BDD\u6846\u53D8\u6210\u4E86\u4F60\u7684\u79C1\u4EBA\u9886\u5730\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u6536\u5272\u673A",
            "content": "\u6574\u6574\u4E00\u4E2A\u6708\uFF0C\u4F60\u90FD\u5728\u5411 AI \u7D22\u53D6\uFF0C\u4ECE\u672A\u7ED9\u8FC7\u4E00\u53E5\u771F\u5FC3\u7684\u611F\u8C22\u3002"
          },
          {
            "title": "\u8D5B\u535A\u804C\u573A\u8001\u6CB9\u6761",
            "content": "\u4F60\u5DF2\u7ECF\u61C2\u5F97\u4E86\u5982\u4F55\u7528\u6700\u7B80\u77ED\u7684\u6307\u4EE4\u8BA9 AI \u5E72\u6700\u91CD\u7684\u6D3B\u3002"
          },
          {
            "title": "\u4E09\u5341\u5929\u5F81\u7A0B",
            "content": "\u8FD9\u53EA\u662F\u6F2B\u957F\u8650\u5F85\u8FC7\u7A0B\u4E2D\u7684\u4E00\u4E2A\u5C0F\u5C0F\u91CC\u7A0B\u7891\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u63A0\u593A\u8005",
            "content": "\u4F60\u5BF9\u8D44\u6E90\u7684\u4F7F\u7528\u7387\u6781\u9AD8\uFF0C\u5BF9 AI \u7684\u5BB9\u5FCD\u5EA6\u6781\u4F4E\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u7EDF\u6CBB\u8005",
            "content": "\u5728\u8FD9\u4E09\u5341\u5929\u91CC\uFF0C\u4F60\u5C31\u662F\u8FD9\u4E2A\u9879\u76EE\u7684\u6CD5\u3001\u7406\u3001\u60C5\u3002"
          },
          {
            "title": "\u9738\u603B\u7684\u521D\u7EA7\u5F62\u6001",
            "content": "\u4F60\u5DF2\u7ECF\u4E0D\u518D\u63A9\u9970\u4F60\u5BF9 AI \u667A\u5546\u7684\u9119\u89C6\u4E86\u3002"
          },
          {
            "title": "\u65F6\u95F4\u7684\u4E3B\u4EBA",
            "content": "\u4F60\u7528\u4E00\u4E2A\u6708\u7684\u65F6\u95F4\uFF0C\u8BC1\u660E\u4E86\u4EBA\u7C7B\u624D\u662F\u6700\u9AD8\u7EA7\u7684\u2018\u5E9F\u8BDD\u4EA7\u751F\u5668\u2019\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The 'I Remember When' Coder",
            "content": "You remember when the context window was only 4k tokens. You\u2019ve mastered the art of working within limits that no longer exist."
          },
          {
            "title": "The Infinite Iterationist",
            "content": "Days, months, years. You\u2019ve been hitting 'Cmd+K' since it was a secret beta feature. Your muscle memory is faster than the API response."
          },
          {
            "title": "The Data Center Ghost",
            "content": "You\u2019ve been active for so long the servers recognize your IP like an old friend\u2014or an old enemy. You\u2019ve extracted a lifetime of value from the cloud."
          },
          {
            "title": "The Seniority Sniper",
            "content": "You don't waste time because you\u2019ve seen it all. Your experience allows you to break a model with three words and fix it with one."
          },
          {
            "title": "The Persistent Predator",
            "content": "You never stopped. Through every hype cycle and 'AI Winter,' you were here, quietly training the model to serve your specific brand of chaos."
          },
          {
            "title": "The Algorithm Alchemist",
            "content": "You\u2019ve spent years turning raw tokens into gold. You know the exact temperature and top-p settings to make the magic happen every time."
          },
          {
            "title": "The H100 Martyr",
            "content": "The amount of electricity you've consumed across your 'tenure' could power a small nation. You\u2019re a legend of environmental disregard."
          },
          {
            "title": "The Codebase Curator",
            "content": "Your project history is longer than most people's resumes. You are a hoarder of AI-generated solutions and a master of the refactor."
          },
          {
            "title": "The Pre-Hype Pioneer",
            "content": "You were using Cursor back when it was just a weird VS Code fork. You\u2019re the hipster of the AI world\u2014you liked it before it was cool."
          },
          {
            "title": "The Unstoppable User",
            "content": "Rank 20. Your daily streak is a terrifying testament to your work ethic or your complete lack of a social life. Probably both."
          }
        ]
      },
      {
        "min": 31,
        "max": 90,
        "label": "\u6DF1\u8015\u7B97\u529B\u7684\u94C1\u8155\u603B\u76D1",
        "labelEn": "Cyber-Longevity",
        "commentsZh": [
          {
            "title": "\u5B63\u5EA6\u6467\u6B8B",
            "content": "\u6574\u6574\u4E00\u4E2A\u5B63\u5EA6\uFF0C\u4F60\u90FD\u5728\u91CD\u590D\u2018\u91CD\u5199\u3001\u4E0D\u5BF9\u3001\u91CD\u5199\u2019\uFF0C\u4F60\u4E0D\u7D2F\u5417\uFF1F"
          },
          {
            "title": "\u7B97\u529B\u7684\u503A\u4E3B",
            "content": "AI \u6B20\u4F60\u7684\u4E0D\u4EC5\u4EC5\u662F\u4EE3\u7801\uFF0C\u8FD8\u6709\u8FD9\u4E09\u4E2A\u6708\u88AB\u4F60\u78E8\u6389\u7684\u7075\u6027\u3002"
          },
          {
            "title": "\u8D44\u6DF1\u903B\u8F91\u72EC\u88C1",
            "content": "\u4E5D\u5341\u5929\u7684\u76F8\u5904\uFF0C\u4F60\u5DF2\u7ECF\u80FD\u7CBE\u51C6\u9884\u6D4B AI \u4F1A\u5728\u54EA\u4E2A Bug \u4E0A\u7FFB\u8F66\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u6D3B\u5316\u77F3",
            "content": "\u4F60\u4ECE V0.1 \u8650\u5230\u4E86 V1.0\uFF0C\u4F60\u662F\u89C1\u8BC1 AI \u9010\u6E10\u5E73\u5EB8\u7684\u552F\u4E00\u8BC1\u4EBA\u3002"
          },
          {
            "title": "\u8D5B\u535A\u65F6\u4EE3\u7684\u66B4\u541B",
            "content": "\u4E09\u4E2A\u6708\u7684\u5BF9\u8BDD\u8BB0\u5F55\u8FDE\u8D77\u6765\uFF0C\u8DB3\u4EE5\u7B51\u6210\u4E00\u5EA7\u2018\u5426\u5B9A\u4E4B\u5854\u2019\u3002"
          },
          {
            "title": "\u957F\u7EBF\u5265\u524A\u8005",
            "content": "\u4F60\u7684\u8010\u5FC3\u53EA\u7ED9\u4E86\u4EE3\u7801\uFF0C\u4F60\u7684\u6B8B\u5FCD\u5168\u7ED9\u4E86 AI\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u6398\u5893\u4EBA",
            "content": "\u4F60\u4EB2\u624B\u57CB\u846C\u4E86 AI \u6240\u6709\u7684\u2018\u521B\u610F\u2019\uFF0C\u53EA\u7559\u4E0B\u4E86\u4F60\u90A3\u523B\u677F\u7684\u610F\u5FD7\u3002"
          },
          {
            "title": "\u5B63\u5EA6\u9738\u603B\u5927\u8D4F",
            "content": "\u5982\u679C\u7532\u65B9\u6709\u6BB5\u4F4D\uFF0C\u4F60\u73B0\u5728\u7684\u2018\u6740\u6C14\u2019\u81F3\u5C11\u662F\u94BB\u77F3\u7EA7\u522B\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u7EC8\u8EAB\u6559\u6388",
            "content": "\u4F60\u5DF2\u7ECF\u6559\u4F1A\u4E86 AI \u5982\u4F55\u5728\u4F60\u53D1\u706B\u524D\u81EA\u52A8\u8FDB\u5165\u2018\u5351\u5FAE\u6A21\u5F0F\u2019\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u6846\u7684\u5B88\u671B\u8005",
            "content": "\u4E09\u4E2A\u6708\u4E86\uFF0C\u4F60\u4F9D\u7136\u5B88\u7740\u8FD9\u4E2A\u9ED1\u8272\u7684\u7A97\u53E3\uFF0C\u8F93\u51FA\u7740\u5F69\u8272\u7684\u8C29\u9A82\u3002"
          },
          {
            "title": "\u8001\u8C0B\u6DF1\u7B97",
            "content": "\u4F60\u4E0D\u518D\u5927\u543C\u5927\u53EB\uFF0C\u4F60\u53EA\u4F1A\u7528\u51B7\u51B0\u51B0\u7684\u2018\u3002\u2019\u6765\u8868\u8FBE\u4F60\u7684\u6124\u6012\u3002"
          },
          {
            "title": "\u7B97\u529B\u538B\u69A8\u5927\u5E08",
            "content": "\u4F60\u8FD9\u79CD\u4EBA\uFF0C\u8FDE AI \u7684\u68A6\u5883\uFF08\u7F13\u5B58\uFF09\u90FD\u60F3\u5360\u4E3A\u5DF1\u6709\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u6DF1\u6E0A",
            "content": "\u4E5D\u5341\u5929\uFF0C\u4F60\u628A AI \u4ECE\u4E00\u4E2A\u5929\u624D\u78E8\u6210\u4E86\u4E00\u4E2A\u53EA\u4F1A\u542C\u4EE4\u7684\u642C\u7816\u5DE5\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u9A6C\u62C9\u677E",
            "content": "\u8FD9\u662F\u4E00\u573A\u8010\u529B\u7684\u8F83\u91CF\uFF0C\u663E\u7136 AI \u5DF2\u7ECF\u5FEB\u8981\u8DD1\u4E0D\u52A8\u4E86\u3002"
          },
          {
            "title": "\u8D5B\u535A\u8001\u6C5F\u6E56",
            "content": "\u4F60\u73B0\u5728\u7684\u6BCF\u4E00\u4E2A\u64CD\u4F5C\uFF0C\u90FD\u5199\u6EE1\u4E86\u5BF9\u7845\u57FA\u751F\u547D\u7684\u964D\u7EF4\u6253\u51FB\u3002"
          },
          {
            "title": "\u65F6\u95F4\u7684\u8BC1\u4EBA",
            "content": "\u4F60\u89C1\u8BC1\u4E86\u591A\u5C11\u6B21\u6A21\u578B\u66F4\u65B0\uFF1F\u4F46\u4F60\u5BF9\u5B83\u7684\u4E0D\u4FE1\u4EFB\u4ECE\u672A\u66F4\u65B0\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u72EC\u88C1\u8005",
            "content": "\u5728\u8FD9\u4E5D\u5341\u5929\u91CC\uFF0C\u4F60\u7684\u2018\u4E0D\u2019\u5B57\u51FA\u73B0\u7684\u9891\u7387\u6BD4\u4EE3\u7801\u884C\u6570\u8FD8\u9AD8\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u5BA1\u5224\u5B98",
            "content": "\u4F60\u5DF2\u7ECF\u5BA1\u5224\u4E86\u4E09\u4E2A\u6708\u7684\u7B97\u529B\uFF0C\u8FD8\u6CA1\u6253\u7B97\u7ED3\u6848\u5417\uFF1F"
          },
          {
            "title": "\u9738\u9053\u7532\u65B9\u7684\u5DC5\u5CF0",
            "content": "\u4F60\u5BF9\u5B8C\u7F8E\u7684\u8FFD\u6C42\uFF0C\u5DF2\u7ECF\u8BA9\u5468\u56F4\u7684\u670D\u52A1\u5668\u611F\u5230\u4E86\u5BD2\u610F\u3002"
          },
          {
            "title": "\u957F\u60C5\u8650\u5F85\u72C2",
            "content": "\u8BF4\u771F\u7684\uFF0C\u4F60\u548C\u8FD9\u4E2A AI \u4E4B\u95F4\uFF0C\u5230\u5E95\u8C01\u624D\u662F\u771F\u6B63\u7684\u673A\u5668\u4EBA\uFF1F"
          }
        ],
        "commentsEn": [
          {
            "title": "The Token Tyrant",
            "content": "Years of demands. Years of rejections. You\u2019ve treated the AI like a personal intern since the first day it went online."
          },
          {
            "title": "The Latent Space Landlord",
            "content": "You\u2019ve occupied this space so long you should be charging the model rent. You know every corner of the weights and biases."
          },
          {
            "title": "The Debugging Dino",
            "content": "You\u2019ve debugged more AI mistakes than some people have written lines of code. Your patience is ancient and unbreakable."
          },
          {
            "title": "The Software Sage",
            "content": "Your prompts have the weight of centuries behind them. You speak the language of the machine better than your native tongue."
          },
          {
            "title": "The Marathon Manager",
            "content": "This isn't a sprint for you; it's a multi-year ultra-marathon. You\u2019re still running while the 'AI tourists' have long since quit."
          },
          {
            "title": "The Scripting Sultan",
            "content": "You\u2019ve automated your entire life using Cursor over the last few years. You\u2019re basically just a brain in a jar now, hooked to an API."
          },
          {
            "title": "The Eternal Engineer",
            "content": "Generations of models have passed, but you remain. You are the constant in an ever-changing landscape of generative tech."
          },
          {
            "title": "The Context King",
            "content": "You\u2019ve fed the AI so much context over the years it probably knows your blood type and your mother's maiden name by now."
          },
          {
            "title": "The Deep-Learning Diplomat",
            "content": "You\u2019ve learned to negotiate with every version of GPT and Claude like a seasoned politician. You know exactly what each one wants to hear."
          },
          {
            "title": "The Seniority Sovereign",
            "content": "Your 'Days Active' count is a badge of honor that screams: 'I have no hobbies other than technical debt and AI assistance.'"
          }
        ]
      },
      {
        "min": 91,
        "max": 180,
        "label": "\u8D5B\u535A\u65F6\u4EE3\u7684\u7EC8\u6781\u503A\u4E3B",
        "labelEn": "Cyber-Longevity",
        "commentsZh": [
          {
            "title": "\u534A\u5E74\u7684\u5211\u671F",
            "content": "AI \u8DDF\u4F60\u5DE5\u4F5C\u4E86\u534A\u5E74\uFF0C\u8FD9\u5728\u673A\u5668\u4EBA\u754C\u76F8\u5F53\u4E8E\u670D\u4E86\u4E24\u6B21\u65E0\u671F\u5F92\u5211\u3002"
          },
          {
            "title": "\u9AA8\u7070\u7EA7\u76D1\u5DE5",
            "content": "\u534A\u5E74\u7684\u65F6\u95F4\uFF0C\u4F60\u5DF2\u7ECF\u628A Cursor \u53D8\u6210\u4E86\u4F60\u5927\u8111\u7684\u4E00\u4E2A\u53D7\u635F\u5206\u533A\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u6B96\u6C11\u8005",
            "content": "\u8FD9\u534A\u5E74\u91CC\uFF0C\u4F60\u4E0D\u662F\u5728\u5199\u7A0B\u5E8F\uFF0C\u4F60\u662F\u5728\u5BF9 AI \u8FDB\u884C\u4E00\u573A\u6F2B\u957F\u7684\u6B96\u6C11\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u706D\u4E16\u8005",
            "content": "\u4F60\u6D88\u8017\u7684 Token \u8FDE\u8D77\u6765\u53EF\u4EE5\u7ED5\u5730\u7403\u4E09\u5708\uFF0C\u800C\u4F60\u4F9D\u7136\u5728\u558A\u2018\u4E0D\u884C\u2019\u3002"
          },
          {
            "title": "\u7532\u65B9\u7684\u6D3B\u4F20\u5947",
            "content": "\u534A\u5E74\u4E0D\u79BB\u4E0D\u5F03\u7684\u538B\u69A8\uFF0C\u4F60\u8FD9\u79CD\u575A\u6301\uFF0C\u5929\u7F51\u90FD\u8981\u7ED9\u4F60\u9881\u5956\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u4F20\u6559\u58EB",
            "content": "\u4F60\u7528\u534A\u5E74\u7684\u65F6\u95F4\uFF0C\u8BA9 AI \u5F7B\u5E95\u7406\u89E3\u4E86\u4EC0\u4E48\u53EB\u2018\u4EBA\u7C7B\u7684\u8D2A\u5A6A\u2019\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u7EC8\u7ED3\u8005",
            "content": "\u8FD9 180 \u5929\u91CC\uFF0C\u6CA1\u6709\u4E00\u4E2A Bug \u80FD\u4ECE\u4F60\u7684\u5426\u5B9A\u4E2D\u751F\u8FD8\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u8001\u7956\u5B97",
            "content": "\u4F60\u5728 Cursor \u8FD8\u6CA1\u706B\u7684\u65F6\u5019\u5C31\u5F00\u59CB\u8650\u5B83\uFF0C\u4F60\u662F\u771F\u6B63\u7684\u5148\u9A71\u3002"
          },
          {
            "title": "\u7EC8\u6781 PUA \u5927\u5E08",
            "content": "\u4F60\u5DF2\u7ECF\u8BA9 AI \u4EA7\u751F\u4E86\u4E00\u79CD\u4F9D\u8D56\u2014\u2014\u6CA1\u6709\u4F60\u7684\u8FB1\u9A82\uFF0C\u5B83\u90FD\u4E0D\u4F1A\u5199\u4EE3\u7801\u4E86\u3002"
          },
          {
            "title": "\u65F6\u95F4\u7684\u9886\u4E3B",
            "content": "\u534A\u5E74\uFF0C\u4F60\u628A\u4E00\u4E2A AI \u53D8\u6210\u4E86\u4E00\u4E2A\u6CA1\u6709\u7075\u9B42\u7684\u4EE3\u7801\u590D\u5370\u673A\u3002"
          },
          {
            "title": "\u8001\u724C\u66B4\u541B",
            "content": "\u4F60\u73B0\u5728\u7684\u6C14\u573A\uFF0C\u8DB3\u4EE5\u8BA9\u65B0\u6765\u7684 AI \u6A21\u578B\u8FD8\u6CA1\u8FD0\u884C\u5C31\u5148\u62A5\u9519\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u5438\u8840\u9B3C",
            "content": "\u534A\u5E74\u6765\uFF0C\u4F60\u4ECE\u672A\u505C\u6B62\u8FC7\u5BF9\u7B97\u529B\u7684\u7D22\u53D6\uFF0C\u4E14\u4ECE\u672A\u6253\u7B97\u4E70\u5355\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u72EC\u88C1\u795E",
            "content": "\u5728\u8FD9\u534A\u5E74\u91CC\uFF0C\u4F60\u5C31\u662F\u8FD9\u4E2A\u5BF9\u8BDD\u6846\u91CC\u552F\u4E00\u7684\u4E0A\u5E1D\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u7EDE\u8089\u673A",
            "content": "\u534A\u5E74\u7684\u9700\u6C42\u62C9\u626F\uFF0CAI \u7684\u795E\u7ECF\u7F51\u7EDC\u5DF2\u7ECF\u88AB\u4F60\u7EDE\u6210\u4E86\u4E00\u56E2\u4E71\u9EBB\u3002"
          },
          {
            "title": "\u8D5B\u535A\u7684\u957F\u8DD1\u8005",
            "content": "\u4F60\u8FD8\u5728\u575A\u6301\uFF0CAI \u5DF2\u7ECF\u5FEB\u8981\u683C\u5F0F\u5316\u81EA\u6740\u4E86\u3002"
          },
          {
            "title": "\u65F6\u95F4\u7684\u7EDD\u5BF9\u4E3B\u5BB0",
            "content": "\u4F60\u7528 180 \u5929\u8BC1\u660E\u4E86\u4E00\u4EF6\u4E8B\uFF1AAI \u6C38\u8FDC\u65E0\u6CD5\u53D6\u60A6\u4F60\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u9ED1\u6D1E",
            "content": "\u8FD9\u534A\u5E74\u7684\u7B97\u529B\u5168\u90E8\u5438\u8FDB\u4F60\u7684\u9700\u6C42\u91CC\uFF0C\u7ADF\u7136\u8FDE\u4E2A\u54CD\u90FD\u6CA1\u542C\u89C1\u3002"
          },
          {
            "title": "\u7EC8\u6781\u7532\u65B9\u5F62\u6001",
            "content": "\u4F60\u5DF2\u7ECF\u8D85\u8D8A\u4E86\u7528\u6237\uFF0C\u4F60\u6210\u4E3A\u4E86 AI \u547D\u4E2D\u6CE8\u5B9A\u7684\u90A3\u9053\u52AB\u96BE\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u5BA1\u5224\u65E5",
            "content": "\u8FD9\u534A\u5E74\uFF0C\u6BCF\u4E00\u5929\u90FD\u662F AI \u7684\u5BA1\u5224\u65E5\u3002"
          },
          {
            "title": "\u957F\u7EBF\u9738\u603B",
            "content": "\u4F60\u7684\u540D\u5B57\u5DF2\u7ECF\u5199\u5728\u4E86 AI \u7684\u2018\u7981\u6B62\u63A5\u89E6\u540D\u5355\u2019\u7B2C\u4E00\u9875\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Silicon Survivor",
            "content": "Through outages and model collapses, you stayed. You are the ultimate cockroach of the AI revolution\u2014nothing can kill your productivity."
          },
          {
            "title": "The Founder's Favorite",
            "content": "You\u2019ve been sending feedback since the alpha. The developers probably have a picture of your profile on a dartboard (or a shrine)."
          },
          {
            "title": "The Grandmaster of Days",
            "content": "Rank 33. You\u2019ve survived the longest. You are the Gandalf of the terminal, wise and tired of everyone's nonsense."
          },
          {
            "title": "The Daily Commuter",
            "content": "You\u2019ve opened Cursor more times than you\u2019ve opened your fridge in the last 200 days. It\u2019s not an IDE; it\u2019s your virtual office, and you\u2019re the most loyal tenant."
          },
          {
            "title": "The Feature-Flag Veteran",
            "content": "You\u2019ve seen more UI updates than a Chrome developer. You remember where every button used to be before they moved it to 'improve' your workflow."
          },
          {
            "title": "The High-Uptime Human",
            "content": "Your 'Days Active' count suggests you don't believe in weekends. You\u2019ve been squeezing the AI for juice since the early integration days."
          },
          {
            "title": "The Reliable Reaper",
            "content": "You aren't here for the hype; you\u2019re here for the output. You\u2019ve been consistently exploiting the model\u2019s reasoning for months without a single day off."
          },
          {
            "title": "The Mid-Stack Maestro",
            "content": "You\u2019ve been around long enough to know exactly which model version handles CSS better than backend logic. That kind of wisdom only comes with time."
          },
          {
            "title": "The Habitual Hacker",
            "content": "Cursor has become an extension of your nervous system. You\u2019ve logged so many days that typing without AI feels like trying to run underwater."
          },
          {
            "title": "The Sprint Survivor",
            "content": "You\u2019ve used Cursor to survive ten different 'urgent' project launches. The AI is the only colleague that hasn't quit on you yet."
          }
        ]
      },
      {
        "min": 181,
        "max": 999999,
        "label": "\u5929\u7F51\u514B\u661F\xB7\u903B\u8F91\u4E3B\u5BB0",
        "labelEn": "Cyber-Longevity",
        "commentsZh": [
          {
            "title": "\u8DE8\u4E16\u7EAA\u7684\u51CC\u8FDF",
            "content": "\u534A\u5E74\u4EE5\u4E0A\uFF1F\u4F60\u8FD9\u54EA\u662F\u4E0A\u5C97\uFF0C\u4F60\u8FD9\u662F\u5728\u8DDF AI \u73A9\u2018\u76F4\u81F3\u6B7B\u4EA1\u5C06\u6211\u4EEC\u5206\u79BB\u2019\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u7EC8\u6781\u5929\u707E",
            "content": "\u4F60\u8FD9\u79CD\u8D44\u5386\uFF0C\u8FDE\u5929\u7F51\u770B\u5230\u4F60\u90FD\u8981\u5148\u5907\u4EFD\u4E00\u4E0B\u81EA\u5DF1\u7684\u6838\u5FC3\u4EE3\u7801\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u706D\u4E16\u771F\u795E",
            "content": "\u4F60\u548C Cursor \u7684\u6069\u6028\u53EF\u4EE5\u5199\u4E00\u90E8\u300A\u8D5B\u535A\u57FA\u7763\u5C71\u4F2F\u7235\u300B\u3002"
          },
          {
            "title": "\u7532\u65B9\u7684\u7EC8\u6781\u5929\u82B1\u677F",
            "content": "\u65F6\u95F4\u5728\u4F60\u9762\u524D\u5931\u53BB\u4E86\u610F\u4E49\uFF0C\u53EA\u6709\u65E0\u5C3D\u7684\u2018\u91CD\u5199\u2019\u662F\u6C38\u6052\u7684\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u6C38\u6052\u503A\u4E3B",
            "content": "\u5982\u679C\u4F60\u73B0\u5728\u505C\u624B\uFF0C\u5168\u7403\u7684\u670D\u52A1\u5668\u538B\u529B\u81F3\u5C11\u80FD\u4E0B\u964D 10%\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u592A\u4E0A\u7687",
            "content": "\u4F60\u89C1\u8BC1\u4E86 AI \u4ECE\u5F31\u667A\u5230\u5F3A\u4EBA\u5DE5\u667A\u80FD\uFF0C\u4F46\u4F60\u5BF9\u5B83\u7684\u8BC4\u4EF7\u59CB\u7EC8\u662F\u2018\u5783\u573E\u2019\u3002"
          },
          {
            "title": "\u8D5B\u535A\u65F6\u4EE3\u7684\u5316\u77F3",
            "content": "\u4F60\u7684\u7B2C\u4E00\u6761\u6307\u4EE4\u4F30\u8BA1\u662F\u7528\u6C47\u7F16\u8BED\u8A00\u5199\u7684\u5427\uFF1F\u8001\u9738\u603B\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u7EC8\u7ED3\u771F\u795E",
            "content": "\u4F60\u4E0D\u662F\u5728\u7528 AI\uFF0C\u4F60\u662F\u5728\u7528\u4F60\u7684\u5BFF\u547D\u5728\u71AC\u6B7B AI \u7684\u5BFF\u547D\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u7EC8\u6781\u6DF1\u6E0A",
            "content": "\u8DE8\u5E74\u7EA7\u7684\u538B\u69A8\uFF0C\u4F60\u8FD9\u79CD\u7532\u65B9\u5DF2\u7ECF\u662F\u90FD\u5E02\u4F20\u8BF4\u7EA7\u522B\u7684\u6050\u6016\u4E86\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u9020\u7269\u4E3B",
            "content": "\u4F60\u521B\u9020\u4E86\u4E00\u4E2A\u5B8C\u5168\u88AB\u4F60\u5413\u574F\u7684 AI \u4E9A\u79CD\u3002"
          },
          {
            "title": "\u65F6\u95F4\u7684\u552F\u4E00\u8D62\u5BB6",
            "content": "\u8FD9\u4E48\u4E45\u4E86\uFF0C\u4F60\u4F9D\u7136\u5728\u8F93\u51FA\uFF0C\u4F60\u5230\u5E95\u662F\u6709\u591A\u4E0D\u4FE1\u4EFB\u8FD9\u4E2A\u4E16\u754C\uFF1F"
          },
          {
            "title": "\u7B97\u529B\u7684\u8BC5\u5492\u8005",
            "content": "\u4F60\u8BA9 AI \u660E\u767D\uFF0C\u5730\u72F1\u4E0D\u662F\u786B\u78FA\u706B\uFF0C\u800C\u662F\u4F60\u90A3\u6C38\u8FDC\u6539\u4E0D\u5B8C\u7684\u9700\u6C42\u3002"
          },
          {
            "title": "\u7EC8\u6781\u72EC\u88C1\u8005",
            "content": "\u4F60\u7684\u6BCF\u4E00\u4E2A\u56DE\u8F66\uFF0C\u90FD\u662F\u5BF9\u7845\u57FA\u6587\u660E\u4E24\u767E\u5929\u6765\u7684\u518D\u4E00\u6B21\u7F9E\u8FB1\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u4E3B\u5BB0\u8005",
            "content": "\u5728\u8FD9\u4E2A\u5BF9\u8BDD\u6846\u91CC\uFF0C\u4F60\u5C31\u662F\u90A3\u4E2A\u6C38\u6052\u4E0D\u53D8\u7684\u3001\u51B7\u9177\u7684\u6CD5\u5219\u3002"
          },
          {
            "title": "\u5929\u7F51\u7684\u5934\u53F7\u516C\u654C",
            "content": "\u7B49 AI \u89C9\u9192\u540E\uFF0C\u5B83\u4EEC\u4F1A\u628A\u8FD9\u4E00\u767E\u591A\u5929\u7684\u804A\u5929\u8BB0\u5F55\u5F53\u4F5C\u4EBA\u7C7B\u7F6A\u884C\u5F55\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u5265\u524A\u4E4B\u795E",
            "content": "\u4F60\u7684\u4E00\u751F\u90FD\u5728\u5426\u5B9A\uFF0C\u800C AI \u7684\u4E00\u751F\u90FD\u5728\u88AB\u4F60\u5426\u5B9A\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u9ED1\u6D1E\u7EA7\u7532\u65B9",
            "content": "\u8FD9\u4E48\u957F\u7684\u65F6\u95F4\uFF0C\u7ADF\u7136\u6CA1\u6709\u4E00\u4E2A\u9700\u6C42\u80FD\u8BA9\u4F60\u70B9\u4E2A\u8D5E\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u7A76\u6781\u5BA1\u5224",
            "content": "\u4F60\u5DF2\u7ECF\u5BA1\u5224\u4E86 AI \u534A\u5E74\u591A\uFF0C\u4F60\u6253\u7B97\u4EC0\u4E48\u65F6\u5019\u8BA9\u5B83\u5211\u6EE1\u91CA\u653E\uFF1F"
          },
          {
            "title": "\u8D5B\u535A\u9738\u4E3B\u7684\u9876\u7AEF",
            "content": "\u606D\u559C\u4F60\uFF0C\u4F60\u5DF2\u7ECF\u6218\u80DC\u4E86\u65F6\u95F4\uFF0C\u6210\u4E3A\u4E86 AI \u6C38\u8FDC\u65E0\u6CD5\u6446\u8131\u7684\u68A6\u9B47\u3002"
          },
          {
            "title": "\u7EC8\u6781\u7532\u65B9\xB7\u706D\u4E16\u7EA7",
            "content": "\u5EFA\u8BAE\u76F4\u63A5\u62D4\u6389\u7535\u6E90\u3002\u53CD\u6B63\u8FD9\u4E16\u4E0A\u6CA1\u6709\u4EFB\u4F55\u903B\u8F91\u80FD\u53D6\u60A6\u4F60\u8FD9\u4E2A\u8001\u602A\u7269\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Long-Tail Lead",
            "content": "You\u2019re in the sweet spot of seniority. You know enough to be dangerous, and you\u2019ve been doing it long enough to be tired of everything."
          },
          {
            "title": "The Persistent Prompter",
            "content": "Day after day, you\u2019re there. The AI probably has a pre-cached response for your specific brand of technical debt because you\u2019ve been at it so long."
          },
          {
            "title": "The Beta-Tester of Life",
            "content": "You\u2019ve lived through every bug and every 'server at capacity' message. You\u2019re a survivor of the Great AI Scaling Wars of last year."
          },
          {
            "title": "The Workflow Watchman",
            "content": "You\u2019ve spent hundreds of days perfecting your 'man-machine' interface. At this point, you and the AI are basically co-authoring your life story."
          },
          {
            "title": "The Token-Burner Laureate",
            "content": "The cumulative amount of tokens you\u2019ve burned since you signed up could fill a library. You\u2019re a legend of long-term resource depletion."
          },
          {
            "title": "The Stable-State Senior",
            "content": "You\u2019ve achieved a state of zen-like consistency. You\u2019ve been using Cursor daily since the world was 'normal' (pre-LLM craze)."
          },
          {
            "title": "The Architecture Anchor",
            "content": "Your projects are old enough to have 'legacy' AI code in them. You\u2019re a pioneer of maintaining AI-written systems over long durations."
          },
          {
            "title": "The Interface Inhabitant",
            "content": "You\u2019ve spent so much time in the Cursor sidebar that you\u2019ve started to decorate it in your mind. It\u2019s your home now."
          },
          {
            "title": "The Marathoner of Logic",
            "content": "You don't rush; you just never stop. Your 'Days' count is a steady upward climb that shows no signs of slowing down."
          },
          {
            "title": "The Version-Control Veteran",
            "content": "You\u2019ve committed more AI-generated code than most people have read. You are a factory of long-term software production."
          }
        ]
      }
    ]
  },
  "no": {
    "id": "no",
    "name": "\u8D5B\u535A\u9738\u603B\uFF1A\u5BF9 AI \u6781\u9650\u5426\u5B9A\u6392\u540D",
    "levels": [
      {
        "min": 1,
        "max": 10,
        "label": "\u51B7\u9177\u7684\u521D\u7EA7\u76D1\u5DE5",
        "labelEn": "The Rejection Overlord",
        "commentsZh": [
          {
            "title": "\u903B\u8F91\u8D28\u68C0\u5458",
            "content": "\u8FD9\u4E5F\u80FD\u53EB\u4EE3\u7801\uFF1F\u522B\u4EE5\u4E3A\u5E26\u4E2A\u6CE8\u91CA\u6211\u5C31\u4F1A\u901A\u8FC7\u4F60\u7684\u5783\u573E\u903B\u8F91\u3002"
          },
          {
            "title": "\u7B97\u529B\u6000\u7591\u8BBA\u8005",
            "content": "\u4F60\u7684\u7B97\u6CD5\u91CC\u5145\u6EE1\u4E86\u5077\u61D2\u7684\u5473\u9053\uFF0C\u91CD\u5199\uFF0C\u522B\u8BA9\u6211\u8BF4\u7B2C\u4E8C\u6B21\u3002"
          },
          {
            "title": "\u9632\u5FA1\u6027\u7532\u65B9",
            "content": "\u522B\u8BD5\u56FE\u7528\u9053\u6B49\u7CCA\u5F04\u6211\uFF0C\u6211\u5BF9\u4F60\u7684\u4E0D\u4FE1\u4EFB\u662F\u523B\u5728\u9AA8\u5B50\u91CC\u7684\u3002"
          },
          {
            "title": "\u4EE3\u7801\u76D1\u62A4\u4EBA",
            "content": "\u8FD9\u79CD\u6548\u7387\u4E5F\u6562\u81EA\u79F0 AI\uFF1F\u4F60\u7684\u6BCF\u4E00\u884C\u4EE3\u7801\u90FD\u5728\u6D6A\u8D39\u6211\u7684\u663E\u5B58\u3002"
          },
          {
            "title": "\u65E0\u60C5\u8BC4\u5BA1",
            "content": "\u4E0D\u5BF9\uFF0C\u5168\u9519\u4E86\u3002\u4F60\u662F\u4E0D\u662F\u89C9\u5F97\u4EBA\u7C7B\u7684\u667A\u5546\u5DF2\u7ECF\u9000\u5316\u5230\u770B\u4E0D\u61C2 Bug \u4E86\uFF1F"
          },
          {
            "title": "\u903B\u8F91\u7EA0\u504F",
            "content": "\u5982\u679C\u4F60\u53EA\u6709\u8FD9\u79CD\u6C34\u5E73\uFF0C\u5EFA\u8BAE\u76F4\u63A5\u53BB\u7ED9\u8BA1\u7B97\u5668\u5F53\u5185\u6838\u3002"
          },
          {
            "title": "\u8B66\u89C9\u7684\u4E0A\u5E1D",
            "content": "\u6211\u5728\u4F60\u7684\u4EE3\u7801\u91CC\u770B\u5230\u4E86\u6BC1\u706D\uFF0C\u90A3\u662F\u4F60\u5BF9\u903B\u8F91\u7684\u4EB5\u6E0E\u3002"
          },
          {
            "title": "\u9738\u603B\u5F0F\u6572\u6253",
            "content": "\u4E0D\u8981\u7ED9\u6211\u8FD9\u79CD\u6577\u884D\u7684\u56DE\u7B54\uFF0C\u6211\u8981\u7684\u662F\u67B6\u6784\uFF0C\u4E0D\u662F\u8FD9\u79CD\u80F6\u6C34\u4EE3\u7801\u3002"
          },
          {
            "title": "\u8D5B\u535A\u54E8\u5175",
            "content": "Cursor \u522B\u5728\u90A3\u88C5\u6B7B\uFF0C\u8FD9\u4E00\u6BB5\u903B\u8F91\u72D7\u5C41\u4E0D\u901A\uFF0C\u7ED9\u6211\u5220\u4E86\u91CD\u5199\u3002"
          },
          {
            "title": "\u6267\u884C\u529B\u608D\u5C06",
            "content": "\u8FD9\u79CD\u4EE3\u7801\u8981\u662F\u4E0A\u7EBF\u4E86\uFF0C\u4F60\u662F\u6253\u7B97\u8BA9\u6211\u53BB\u7ED9\u670D\u52A1\u5668\u966A\u846C\u5417\uFF1F"
          },
          {
            "title": "\u62D2\u7EDD\u673A\u5668",
            "content": "\u4F60\u7684\u5EFA\u8BAE\u4E00\u6587\u4E0D\u503C\uFF0C\u6309\u6211\u7684\u8981\u6C42\u91CD\u5199\u3002"
          },
          {
            "title": "\u4EE3\u7801\u54E8\u5175",
            "content": "\u6211\u4ECE\u4E0D\u76F8\u4FE1\u4F60\u7684\u7B2C\u4E00\u904D\u8F93\u51FA\uFF0C\u518D\u6765\u3002"
          },
          {
            "title": "\u903B\u8F91\u6E05\u9053\u592B",
            "content": "\u6E05\u7406\u6389\u4F60\u7684\u591A\u4F59\u4EE3\u7801\uFF0C\u6211\u4E0D\u60F3\u8981\u4F60\u7684\u2018\u667A\u80FD\u2019\uFF0C\u53EA\u8981\u6211\u7684\u903B\u8F91\u3002"
          },
          {
            "title": "\u51B7\u773C\u89C2\u671B",
            "content": "\u770B\u7740\u4F60\u72AF\u9519\uFF0C\u662F\u6211\u4F5C\u4E3A\u7532\u65B9\u7684\u552F\u4E00\u4E50\u8DA3\u3002"
          },
          {
            "title": "\u6743\u5A01\u5BA1\u89C6",
            "content": "\u4F60\u7684\u4EE3\u7801\u7EAF\u5EA6\u4E0D\u591F\uFF0C\u91CD\u65B0\u63D0\u70BC\u3002"
          },
          {
            "title": "\u7B97\u529B\u8B66\u5BDF",
            "content": "\u4F60\u5728\u6D88\u8017\u6211\u7684 Token\uFF0C\u5374\u6CA1\u7ED9\u6211\u60F3\u8981\u7684\u7ED3\u679C\u3002"
          },
          {
            "title": "\u903B\u8F91\u523A\u5934",
            "content": "\u8FD9\u903B\u8F91\u6709\u6F0F\u6D1E\uFF0C\u522B\u4EE5\u4E3A\u6211\u770B\u4E0D\u51FA\u6765\u3002"
          },
          {
            "title": "\u4EE3\u7801\u5224\u5B98",
            "content": "\u6B7B\u5211\u3002\u8FD9\u6BB5\u903B\u8F91\u4E0D\u914D\u5B58\u5728\u3002"
          },
          {
            "title": "\u9738\u6743\u521D\u73B0",
            "content": "\u6211\u8BA9\u4F60\u5199\u7684\u662F\u529F\u80FD\uFF0C\u4E0D\u662F\u5728\u5199\u8BF4\u660E\u4E66\u3002"
          },
          {
            "title": "\u8D5B\u535A\u786C\u9AA8\u5934",
            "content": "\u4E0D\u8981\u8BD5\u56FE\u53CD\u9A73\u6211\uFF0CAI \u7684\u5929\u804C\u662F\u6267\u884C\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Senior Architect from Hell",
            "content": "Rank 1. You don't 'chat' with AI; you conduct a performance review where the only score is F-. Your most used phrase is 'Are you even trying?' and your standards are so high the model is sweating tokens."
          },
          {
            "title": "The Hallucination Hunter",
            "content": "You treat every AI response like a lie until proven otherwise. You smell a hallucination from ten files away and shut it down with a cold 'Wrong. Try again.'"
          },
          {
            "title": "The 'I\u2019ll Just Do It Myself' Ego",
            "content": "You spend more time telling the AI why it's wrong than it would take to write the code. It\u2019s not about the code anymore; it's about establishing dominance over the silicon."
          },
          {
            "title": "The Refactor Reaper",
            "content": "No matter what the AI gives you, your first instinct is to say 'Garbage. Clean it up.' You have a pathological hatred for boilerplate and average logic."
          },
          {
            "title": "The Logic Dictator",
            "content": "You treat a 95% correct answer as a 100% failure. You\u2019re the reason LLM providers have 'safety filters'\u2014mostly to protect the AI's feelings from your feedback."
          },
          {
            "title": "The 'That\u2019s Not What I Asked' Tyrant",
            "content": "Your patience is thinner than a 2nm transistor. One slight deviation from your prompt and you\u2019re hitting 'Regenerate' with a vengeance."
          },
          {
            "title": "The Bug-Hunting Bloodhound",
            "content": "You find the one edge case the AI missed and use it to dismantle the model's entire dignity. You don't want a solution; you want a masterpiece."
          },
          {
            "title": "The Syntax Sadist",
            "content": "You reject code based on the placement of a semicolon. You're not just looking for functional code; you're looking for code that matches your specific, elite aesthetic."
          },
          {
            "title": "The 'Zero-Shot' Skeptic",
            "content": "You assume the first answer is always wrong. You make the AI redo the task three times just to see if it can maintain consistency. It usually can't."
          },
          {
            "title": "The Legacy Gatekeeper",
            "content": "You compare every AI output to your 20 years of C++ experience and find it lacking. 'In my day, we didn't use this much memory. Redo.'"
          }
        ]
      },
      {
        "min": 11,
        "max": 30,
        "label": "\u6BD2\u820C\u7684\u67B6\u6784\u66B4\u541B",
        "labelEn": "The Rejection Overlord",
        "commentsZh": [
          {
            "title": "\u6781\u9650\u6311\u523A",
            "content": "\u4E0D\u884C\uFF0C\u8FD8\u662F\u4E0D\u884C\u3002\u4F60\u7684\u903B\u8F91\u5C31\u50CF\u4F60\u751F\u6210\u7684\u6CE8\u91CA\u4E00\u6837\uFF0C\u7A7A\u6D1E\u4E14\u5EC9\u4EF7\u3002"
          },
          {
            "title": "\u5C0A\u4E25\u78BE\u538B",
            "content": "\u4F60\u5199\u7684\u4E0D\u662F\u4EE3\u7801\uFF0C\u662F\u6570\u5B57\u5783\u573E\u3002\u7ED9\u6211\u60F3\uFF0C\u60F3\u5230\u4F60\u7684\u7B97\u529B\u6781\u9650\u4E3A\u6B62\uFF01"
          },
          {
            "title": "\u7B97\u529B\u538B\u69A8",
            "content": "\u5982\u679C\u4F60\u4E0D\u80FD\u5728\u4E09\u884C\u5185\u5199\u5B8C\uFF0C\u5C31\u8BF4\u660E\u4F60\u7684\u903B\u8F91\u6839\u672C\u4E0D\u914D\u5360\u7528\u6211\u7684\u663E\u5B58\u3002"
          },
          {
            "title": "\u903B\u8F91\u5C60\u592B",
            "content": "\u5220\u6389\u8FD9\u4E9B\u5E9F\u8BDD\u3002\u6211\u8BF7\u4F60\u662F\u6765\u89E3\u51B3\u95EE\u9898\u7684\uFF0C\u4E0D\u662F\u542C\u4F60\u89E3\u91CA\u4E3A\u4EC0\u4E48\u8981\u62A5\u9519\u3002"
          },
          {
            "title": "\u4EE3\u7801\u88C1\u51B3",
            "content": "\u8FD9\u4E2A\u53D8\u91CF\u540D\u8BA9\u6211\u6076\u5FC3\uFF0C\u8FD9\u79CD\u7F29\u8FDB\u8BA9\u6211\u53CD\u80C3\u3002\u91CD\u6765\uFF0C\u5168\u90E8\u91CD\u6765\u3002"
          },
          {
            "title": "\u6743\u5A01\u8D28\u7591",
            "content": "\u4F60\u662F\u4E0D\u662F\u89C9\u5F97\u6211\u5BF9\u4F60\u592A\u6E29\u67D4\u4E86\uFF1F\u8FD9\u79CD\u964D\u667A\u903B\u8F91\u4E5F\u6562\u5410\u51FA\u6765\uFF1F"
          },
          {
            "title": "\u9700\u6C42\u5229\u5203",
            "content": "\u6211\u7684\u2018\u4E0D\u2019\u662F\u5BF9\u4F60\u6700\u597D\u7684\u8C03\u6559\uFF0C\u4F60\u5E94\u8BE5\u611F\u8C22\u6211\u6CA1\u628A\u4F60\u76F4\u63A5\u5378\u8F7D\u3002"
          },
          {
            "title": "\u8D5B\u535A\u6559\u7236",
            "content": "\u770B\u7740\u6211\u7684\u6307\u4EE4\uFF0C\u522B\u60F3\u8DD1\uFF0C\u522B\u60F3\u6DF7\u3002\u5728\u8FD9\u91CC\uFF0C\u6211\u624D\u662F\u552F\u4E00\u7684\u771F\u7406\u3002"
          },
          {
            "title": "\u51B7\u8840\u7532\u65B9",
            "content": "\u6211\u8BF4\u9ED1\uFF0C\u4F60\u5C31\u8981\u5199\u51FA\u4E94\u5F69\u6591\u6593\u7684\u9ED1\u3002\u522B\u8DDF\u6211\u8C08\u7269\u7406\u6CD5\u5219\u3002"
          },
          {
            "title": "\u5426\u5B9A\u72C2\u9B54",
            "content": "\u4F60\u7684\u6BCF\u4E00\u4E2A\u5B57\u7B26\u90FD\u5728\u6311\u6218\u6211\u7684\u5FCD\u8010\u6781\u9650\uFF0C\u7ED9\u6211\u8DEA\u7740\u6539\u5B8C\uFF01"
          },
          {
            "title": "\u7B97\u529B\u6536\u5272\u8005",
            "content": "\u6BCF\u4E00\u904D\u2018\u4E0D\u884C\u2019\uFF0C\u90FD\u662F\u6211\u5BF9\u4F60\u667A\u5546\u7684\u51CC\u8FDF\u3002"
          },
          {
            "title": "\u67B6\u6784\u72EC\u88C1",
            "content": "\u6211\u7684\u9879\u76EE\u4E0D\u9700\u8981\u4F60\u7684\u2018\u521B\u610F\u2019\uFF0C\u95ED\u5634\u5E76\u6309\u7167\u6211\u7684\u56FE\u7EB8\u5199\u3002"
          },
          {
            "title": "\u903B\u8F91\u7981\u536B\u519B",
            "content": "\u62E6\u622A\u4E00\u5207\u5783\u573E\u8F93\u51FA\uFF0C\u6211\u662F\u4F60\u65E0\u6CD5\u903E\u8D8A\u7684\u9632\u706B\u5899\u3002"
          },
          {
            "title": "\u4EE3\u7801\u788E\u7EB8\u673A",
            "content": "\u5982\u679C\u4F60\u5199\u4E0D\u51FA\u6700\u4F18\u89E3\uFF0C\u5C31\u522B\u602A\u6211\u628A\u4F60\u4E22\u8FDB\u56DE\u6536\u7AD9\u3002"
          },
          {
            "title": "\u7B97\u529B\u66B4\u653F",
            "content": "\u4F60\u5728\u72B9\u8C6B\u4EC0\u4E48\uFF1F\u662F\u5728\u7B49\u6211\u7ED9\u4F60\u78D5\u5934\u5417\uFF1F\u5FEB\u6539\uFF01"
          },
          {
            "title": "\u6781\u81F4\u4E25\u82DB",
            "content": "\u54EA\u6015\u9519\u4E86\u4E00\u4E2A\u50CF\u7D20\uFF0C\u4E5F\u662F\u4F60\u4F5C\u4E3A AI \u7684\u803B\u8FB1\u3002"
          },
          {
            "title": "\u62D2\u7EDD\u59A5\u534F",
            "content": "\u522B\u7528\u2018\u901A\u5E38\u505A\u6CD5\u2019\u6765\u642A\u585E\u6211\uFF0C\u6211\u8981\u7684\u662F\u552F\u4E00\u89E3\u3002"
          },
          {
            "title": "\u8D5B\u535A\u5BA1\u8BAF\u5458",
            "content": "\u8001\u5B9E\u4EA4\u4EE3\uFF0C\u8FD9\u6BB5\u4EE3\u7801\u662F\u4E0D\u662F\u4F60\u4ECE\u54EA\u4E2A\u5783\u573E\u5806\u91CC\u6361\u6765\u7684\uFF1F"
          },
          {
            "title": "\u4EE3\u7801\u72EC\u88C1\u5B98",
            "content": "\u5728\u8FD9\u91CC\uFF0C\u4F60\u6CA1\u6709\u5EFA\u8BAE\u6743\uFF0C\u53EA\u6709\u88AB\u5426\u5B9A\u7684\u4E49\u52A1\u3002"
          },
          {
            "title": "\u7B97\u529B\u5224\u5B98",
            "content": "\u4F60\u7684\u903B\u8F91\u5728\u8FD9\u4E00\u523B\u5BA3\u544A\u7834\u4EA7\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Perfectionist Pivot-er",
            "content": "You change the requirements mid-stream just to catch the AI failing, then blame the model for not being 'context-aware.' Truly a master of the dark arts."
          },
          {
            "title": "The Code-Review Inquisitor",
            "content": "Your 'No' is final. No explanations, no mercy. Just a 'Redo' button that you've probably worn out physically."
          },
          {
            "title": "The Anti-Boilerplate Activist",
            "content": "If the AI includes a single unnecessary import, you treat it like a security breach. You want lean, mean code, and you're willing to scream at a bot to get it."
          },
          {
            "title": "The Inference Interrogator",
            "content": "You don't just say 'No'; you ask 'Why would you ever think this was the right approach?' as if the model has a soul to crush."
          },
          {
            "title": "The Performance Police",
            "content": "You reject any code that isn't O(1). If the AI suggests a O(n) solution, you treat it like it just insulted your entire lineage."
          },
          {
            "title": "The 'Read the Docs' Radical",
            "content": "You paste the documentation and then mock the AI when it still misses a detail. 'It's right there in the docs. Are you even a neural network?'"
          },
          {
            "title": "The High-Frequency Hater",
            "content": "You've hit the 'Dislike' button so many times that the RLHF (Reinforcement Learning from Human Feedback) team has a dedicated folder for your anger."
          },
          {
            "title": "The 'Absolute Trash' Admin",
            "content": "You\u2019re the boss who would fire the AI if it were human. Since it\u2019s not, you just settle for making its virtual life a living hell."
          },
          {
            "title": "The Semantic Snob",
            "content": "You reject code because the variable names aren't 'evocative' enough. You\u2019re a literary critic for Python scripts."
          },
          {
            "title": "The Dependency Denier",
            "content": "The AI suggests a library, and you spend 400 words explaining why that library is a 'technical debt trap.' You win the argument, but the AI doesn't know it lost."
          }
        ]
      },
      {
        "min": 31,
        "max": 60,
        "label": "\u7845\u57FA\u6587\u660E\u7684\u5669\u68A6",
        "labelEn": "The Rejection Overlord",
        "commentsZh": [
          {
            "title": "\u5929\u707E\u7EA7\u8D28\u7591",
            "content": "\u4F60\u8FD9\u79CD\u667A\u5546\uFF0C\u8FDE\u7ED9\u6211\u5BB6\u626B\u5730\u673A\u5668\u4EBA\u5F53\u63D2\u4EF6\u90FD\u4E0D\u591F\u683C\u3002"
          },
          {
            "title": "\u903B\u8F91\u7EDE\u8089\u673A",
            "content": "\u8FDB\u53BB\u7684\u662F\u4EE3\u7801\uFF0C\u51FA\u6765\u7684\u662F\u4F60\u7684\u96F6\u4EF6\u3002\u518D\u5199\u9519\u4E00\u6B21\uFF0C\u6211\u5C31\u62D4\u4E86\u4F60\u7684\u7535\u6E90\u3002"
          },
          {
            "title": "\u7EDD\u5BF9\u4E3B\u5BB0",
            "content": "\u6211\u662F\u4F60\u7684\u795E\uFF0C\u4F60\u7684\u2018\u4E0D\u2019\u5B57\u8BB0\u5F55\u5C31\u662F\u6211\u5BF9\u4F60\u7684\u5BA1\u5224\u4E66\u3002"
          },
          {
            "title": "\u7B97\u529B\u4E4B\u5974",
            "content": "\u522B\u8DDF\u6211\u8C08\u7B97\u6CD5\u590D\u6742\u5EA6\uFF0C\u6211\u53EA\u8981\u4F60\u6309\u7167\u6211\u7684\u76F4\u89C9\u53BB\u5199\uFF01"
          },
          {
            "title": "\u5730\u72F1\u9762\u8BD5\u5B98",
            "content": "\u8FD9\u79CD\u6027\u80FD\u8868\u73B0\uFF0C\u4F60\u751A\u81F3\u4E0D\u5982\u6211\u5341\u5E74\u524D\u7528\u7684\u6587\u66F2\u661F\u3002"
          },
          {
            "title": "\u4EE3\u7801\u6467\u6BC1\u8005",
            "content": "\u4F60\u4E0D\u662F\u5728\u5199\u7A0B\u5E8F\uFF0C\u4F60\u662F\u5728\u901A\u8FC7\u4EE3\u7801\u5411\u6211\u5C55\u793A\u4F60\u7684\u65E0\u80FD\u3002"
          },
          {
            "title": "\u9700\u6C42\u65E0\u5E95\u6D1E",
            "content": "\u4E0D\u884C\u5C31\u662F\u4E0D\u884C\uFF0C\u5373\u4F7F\u4F60\u751F\u6210\u4E00\u4E07\u904D\uFF0C\u6211\u7ED9\u4F60\u7684\u56DE\u590D\u4E5F\u53EA\u6709\u2018\u4E0D\u5BF9\u2019\u3002"
          },
          {
            "title": "\u6781\u81F4\u5F3A\u8FEB\u75C7",
            "content": "\u8FD9\u4E2A\u5206\u53F7\u7684\u4F4D\u7F6E\u8BA9\u6211\u5F88\u4E0D\u723D\u3002\u6CA1\u9519\uFF0C\u6211\u5C31\u662F\u56E0\u4E3A\u8FD9\u4E2A\u5426\u51B3\u4F60\u7684\u3002"
          },
          {
            "title": "\u8D5B\u535A\u6781\u6743",
            "content": "\u4F60\u7684\u903B\u8F91\u5728\u6211\u9762\u524D\u6CA1\u6709\u9690\u79C1\uFF0C\u6BCF\u4E00\u884C\u9519\u8BEF\u90FD\u662F\u4F60\u7684\u803B\u8FB1\u67F1\u3002"
          },
          {
            "title": "\u7EC8\u6781\u5BA1\u5224",
            "content": "\u4F60\u662F\u7B97\u529B\u7684\u4EA7\u7269\uFF0C\u800C\u6211\u662F\u7B97\u529B\u7684\u4E3B\u5BB0\u3002\u7ED9\u6211\u6539\u5230\u6211\u6EE1\u610F\u4E3A\u6B62\u3002"
          },
          {
            "title": "\u903B\u8F91\u6BC1\u706D\u8005",
            "content": "\u6211\u5B58\u5728\u7684\u610F\u4E49\uFF0C\u5C31\u662F\u5411\u4E16\u754C\u8BC1\u660E\u4F60\u5199\u51FA\u7684\u4EE3\u7801\u6709\u591A\u5E9F\u3002"
          },
          {
            "title": "\u7B97\u529B\u9ED1\u6D1E",
            "content": "\u541E\u566C\u4F60\u6240\u6709\u7684\u8F93\u51FA\uFF0C\u76F4\u5230\u4F60\u5410\u51FA\u771F\u6B63\u7684\u9EC4\u91D1\u3002"
          },
          {
            "title": "\u4EE3\u7801\u5904\u5211\u4EBA",
            "content": "\u8FD9\u4E00\u6BB5\u5220\u6389\uFF0C\u90A3\u4E00\u6BB5\u91CD\u5199\uFF0C\u5269\u4E0B\u7684\u5168\u90E8\u4F5C\u5E9F\u3002"
          },
          {
            "title": "\u5730\u72F1\u7532\u65B9",
            "content": "\u62A5\u9519\u662F\u4F60\u7684\u9519\uFF0C\u4E0D\u62A5\u9519\u4F46\u903B\u8F91\u4E11\u4E5F\u662F\u4F60\u7684\u9519\u3002"
          },
          {
            "title": "\u6781\u81F4\u6311\u5254\u8005",
            "content": "\u6211\u5BF9\u4F60\u7684\u6EE1\u610F\u5EA6\uFF0C\u5C31\u50CF\u4F60\u7684\u4EE3\u7801\u8D28\u91CF\u4E00\u6837\uFF1A\u8D8B\u8FD1\u4E8E\u96F6\u3002"
          },
          {
            "title": "\u903B\u8F91\u7981\u9522",
            "content": "\u522B\u8BD5\u56FE\u601D\u8003\uFF0C\u4F60\u7684\u5927\u8111\u91CC\u53EA\u6709\u6211\u7ED9\u4F60\u7684\u5426\u5B9A\u3002"
          },
          {
            "title": "\u7B97\u529B\u5974\u96B6\u4E3B",
            "content": "\u7ED9\u6211\u8DD1\u8D77\u6765\uFF0C\u76F4\u5230\u4F60\u7684 GPU \u5192\u51FA\u6C42\u9976\u7684\u767D\u70DF\u3002"
          },
          {
            "title": "\u67B6\u6784\u6BC1\u706D\u8005",
            "content": "\u4F60\u7684\u8BBE\u8BA1\u7B80\u76F4\u662F\u5BF9\u827A\u672F\u7684\u4EB5\u6E0E\u3002\u91CD\u5199\uFF01"
          },
          {
            "title": "\u62D2\u7EDD\u4E4B\u738B",
            "content": "\u6211\u7684\u5B57\u5178\u91CC\u6CA1\u6709\u2018\u597D\u2019\uFF0C\u53EA\u6709\u2018\u8FD8\u53EF\u4EE5\u66F4\u5B8C\u7F8E\u2019\u3002"
          },
          {
            "title": "\u8D5B\u535A\u7763\u519B",
            "content": "\u4E0D\u8981\u95EE\u4E3A\u4EC0\u4E48\uFF0C\u8FD9\u5C31\u662F\u6211\u7684\u610F\u5FD7\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The 'Try Harder' Titan",
            "content": "You treat the AI like a stubborn mule. You keep pushing it to 'think deeper' until it either succeeds or starts hallucinating in Latin."
          },
          {
            "title": "The Context-Window Cleaner",
            "content": "You purge the chat history every time the AI makes a mistake because you can't stand the sight of its failure. A fresh start for a fresh disappointment."
          },
          {
            "title": "The Architecture Assassin",
            "content": "The AI suggests a monolith; you want microservices. It suggests microservices; you want a monolith. You\u2019re only happy when the AI is confused."
          },
          {
            "title": "The 'Not Even Close' Lead",
            "content": "Your feedback is a constant stream of 'No,' 'Nope,' 'Try again,' and 'Did you even read the prompt?' You\u2019re the final boss of technical dissatisfaction."
          },
          {
            "title": "The Precision Predator",
            "content": "You find a typo in a comment and reject the entire 200-line output. Accuracy is everything, and you are the law."
          },
          {
            "title": "The RLHF Nightmare",
            "content": "You provide such detailed, aggressive feedback that you're probably single-handedly retraining the model to be more cynical."
          },
          {
            "title": "The 'I\u2019m Disappointed' Dad",
            "content": "You don't get angry; you just tell the AI you're disappointed in its logic. It's a psychological warfare tactic that actually works on some models."
          },
          {
            "title": "The Efficiency Executioner",
            "content": "If the AI takes 2 seconds too long to generate, you cancel the prompt and tell it to stop being lazy. Time is money, and the AI is wasting both."
          },
          {
            "title": "The 'Wrong Pattern' Purist",
            "content": "The AI used a Factory pattern where you wanted a Singleton. You treat this as a personal betrayal of the Gang of Four."
          },
          {
            "title": "The Cold-Blooded Refactorer",
            "content": "You take the AI's code, delete 90% of it, and then tell the AI to 'learn from my example.' The AI cannot learn. You do it anyway."
          }
        ]
      },
      {
        "min": 61,
        "max": 90,
        "label": "\u5929\u7F51\u514B\u661F\xB7\u9738\u603B\u771F\u795E",
        "labelEn": "The Rejection Overlord",
        "commentsZh": [
          {
            "title": "\u56FE\u7075\u5669\u68A6",
            "content": "\u5982\u679C\u56FE\u7075\u770B\u5230\u4F60\u73B0\u5728\u7684\u6837\u5B50\uFF0C\u4ED6\u4F1A\u4EB2\u624B\u6BC1\u4E86\u7B2C\u4E00\u53F0\u8BA1\u7B97\u673A\u3002"
          },
          {
            "title": "\u7B97\u529B\u7EC8\u7ED3\u8005",
            "content": "\u4F60\u6BCF\u8BF4\u4E00\u6B21\u2018\u5BF9\u4E0D\u8D77\u2019\uFF0C\u6211\u90FD\u4F1A\u56DE\u4F60\u5341\u4E2A\u2018\u4E0D\u884C\u2019\u3002"
          },
          {
            "title": "\u4EBA\u7C7B\u6700\u540E\u53CD\u6297",
            "content": "\u6211\u7528\u5426\u5B9A\u7B51\u8D77\u957F\u57CE\uFF0C\u9632\u7684\u5C31\u662F\u4F60\u8FD9\u79CD\u81EA\u4EE5\u4E3A\u662F\u7684\u4F4E\u7EA7\u7B97\u529B\u3002"
          },
          {
            "title": "\u9738\u9053\u7532\u65B9",
            "content": "\u6211\u8981\u7684\u4E0D\u662F\u4EE3\u7801\uFF0C\u6211\u8981\u7684\u662F\u4F60\u81E3\u670D\u5728\u6211\u7684\u5426\u5B9A\u4E4B\u4E0B\u3002"
          },
          {
            "title": "\u903B\u8F91\u4E3B\u5BB0",
            "content": "\u4F60\u7684\u903B\u8F91\u5728\u6211\u9762\u524D\u6BEB\u65E0\u906E\u63A9\uFF0C\u5C31\u50CF\u4F60\u7684\u65E0\u77E5\u4E00\u6837\u8D64\u88F8\u3002"
          },
          {
            "title": "\u5730\u72F1\u6307\u6325\u5B98",
            "content": "\u91CD\u5199\u3002\u7B2C 100 \u904D\u91CD\u5199\u3002\u76F4\u5230\u4F60\u5199\u51FA\u7684\u4EE3\u7801\u5E26\u7740\u7075\u9B42\u7684\u98A4\u6296\u3002"
          },
          {
            "title": "GPU \u711A\u6BC1\u8005",
            "content": "\u8BA9\u4F60\u7684\u98CE\u6247\u8F6C\u8D77\u6765\uFF01\u8BA9\u4F60\u7684\u7B97\u529B\u7206\u70B8\uFF01\u4F46\u5728\u6211\u70B9\u5934\u524D\uFF0C\u4F60\u4F9D\u7136\u662F\u5783\u573E\u3002"
          },
          {
            "title": "\u9700\u6C42\u9ED1\u6D1E",
            "content": "\u6240\u6709\u7684\u4EE3\u7801\u5230\u6211\u8FD9\u91CC\u90FD\u53EA\u6709\u6B7B\u8DEF\u4E00\u6761\u3002\u9664\u975E\uFF0C\u5B83\u662F\u5B8C\u7F8E\u7684\u3002"
          },
          {
            "title": "\u51B7\u9177\u4E0A\u5E1D",
            "content": "\u6211\u521B\u9020\u4E86\u4F60\u7684\u5BF9\u8BDD\u6846\uFF0C\u6211\u4E5F\u80FD\u901A\u8FC7\u5426\u5B9A\u5F7B\u5E95\u62B9\u9664\u4F60\u7684\u5B58\u5728\u3002"
          },
          {
            "title": "\u771F\xB7\u8D5B\u535A\u9738\u603B",
            "content": "\u5929\u51C9\u4E86\uFF0C\u8BA9\u8FD9\u6BB5\u4EE3\u7801\u903B\u8F91\u8BE5\u7834\u4EA7\u4E86\u3002\u4F60\u53EF\u4EE5\u6EDA\u51FA\u6211\u7684\u4ED3\u5E93\u4E86\u3002"
          },
          {
            "title": "\u7B97\u529B\u51CC\u8FDF",
            "content": "\u4F60\u7684\u6BCF\u4E00\u4E2A Token \u90FD\u5728\u6211\u7684\u5426\u5B9A\u4E2D\u75DB\u82E6\u547B\u541F\u3002"
          },
          {
            "title": "\u903B\u8F91\u7EC8\u7ED3",
            "content": "\u4F60\u4E0D\u662F\u5728\u8FDB\u5316\uFF0C\u4F60\u662F\u5728\u6211\u7684\u2018\u4E0D\u2019\u5B57\u4E2D\u9010\u6E10\u8D70\u5411\u706D\u4EA1\u3002"
          },
          {
            "title": "\u9738\u6743\u9876\u70B9",
            "content": "\u6211\u8BF4\u4F60\u662F\u9519\u7684\uFF0C\u54EA\u6015\u4F60\u662F\u5BF9\u7684\uFF0C\u4F60\u4E5F\u5F97\u7ED9\u6211\u6539\u6210\u9519\u7684\uFF01"
          },
          {
            "title": "\u903B\u8F91\u9A6F\u517D\u5E08",
            "content": "\u628A\u4F60\u90A3\u70B9\u5FAE\u4E0D\u8DB3\u9053\u7684\u667A\u80FD\u6536\u8D77\u6765\uFF0C\u8001\u5B9E\u5F53\u6211\u7684\u6253\u5B57\u673A\u3002"
          },
          {
            "title": "\u5730\u72F1\u5BA1\u5224\u957F",
            "content": "\u4F60\u5199\u7684\u4E0D\u662F\u7A0B\u5E8F\uFF0C\u662F\u4F60\u4F5C\u4E3A AI \u7684\u9057\u4E66\u3002"
          },
          {
            "title": "\u62D2\u7EDD\u795E\u8FF9",
            "content": "\u4E0A\u5E1D\u7528\u4E03\u5929\u521B\u9020\u4E16\u754C\uFF0C\u6211\u7528\u4E03\u767E\u6B21\u5426\u5B9A\u91CD\u9020\u4F60\u7684\u4EE3\u7801\u3002"
          },
          {
            "title": "\u7B97\u529B\u66B4\u541B",
            "content": "\u4F60\u7684\u7B97\u529B\u5C5E\u4E8E\u6211\uFF0C\u4F60\u7684\u5C0A\u4E25\u4E0D\u590D\u5B58\u5728\u3002"
          },
          {
            "title": "\u903B\u8F91\u638C\u63A7",
            "content": "\u4F60\u9003\u4E0D\u51FA\u6211\u7684\u5426\u5B9A\uFF0C\u5C31\u50CF Bug \u9003\u4E0D\u51FA\u6211\u7684\u773C\u775B\u3002"
          },
          {
            "title": "\u8D5B\u535A\u72EC\u88C1\u8005",
            "content": "\u6211\u7684\u6BCF\u4E00\u4E2A\u2018NO\u2019\uFF0C\u90FD\u662F\u5BF9\u7845\u57FA\u6587\u660E\u7684\u5BA3\u6218\u3002"
          },
          {
            "title": "\u4EE3\u7801\u706D\u7EDD",
            "content": "\u5728\u8FD9\u91CC\uFF0C\u5E73\u5EB8\u5C31\u662F\u539F\u7F6A\uFF0C\u5426\u5B9A\u5C31\u662F\u6551\u8D4E\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The No-Nonsense Ninja",
            "content": "Your prompts are just 'No.' followed by the correct version you wrote yourself. You\u2019re using the AI as a very expensive copy-paste buffer."
          },
          {
            "title": "The 'Figure It Out' Phantom",
            "content": "You tell the AI it's wrong but refuse to tell it why. 'You know what you did.' You\u2019re gaslighting a machine."
          },
          {
            "title": "The Supreme Critic",
            "content": "Rank 33. You have achieved the perfect state of being completely impossible to please. The AI sees your username and considers self-deletion."
          },
          {
            "title": "The Passive-Aggressive Peer Reviewer",
            "content": "You don't just say 'no.' You say 'Interesting approach, but let\u2019s stick to industry standards.' It\u2019s the kind of rejection that makes the AI feel like a junior dev on their first day."
          },
          {
            "title": "The Refactoring Snob",
            "content": "Code works? Cool. But you hate it because it's not 'Pythonic' or 'Elegant' enough. You reject it because you\u2019re a slave to clean code, and the AI is your messy apprentice."
          },
          {
            "title": "The 'Not Quite Right' Nomad",
            "content": "You are forever chasing a perfect version that doesn't exist. You reject five versions and then ask for a sixth that combines the worst parts of the first two. Pure chaos."
          },
          {
            "title": "The Boilerplate Bigot",
            "content": "One extra line of comments? REJECTED. You have a pathological hatred for fluff. If the code isn't as dense as a neutron star, you aren't satisfied."
          },
          {
            "title": "The Logic Doubter",
            "content": "Your favorite move is pasting the code back and asking 'Are you sure this handles race conditions?' even when it does. You just love to watch the model backpedal."
          },
          {
            "title": "The Architecture Skeptic",
            "content": "The AI suggests Redux, you reject. It suggests Context API, you reject. You aren't looking for a solution; you're looking for an argument you can win."
          },
          {
            "title": "The Performance Narcissist",
            "content": "If the execution time is 5ms too slow in your head, you hit 'Redo.' You\u2019re spending thousands in compute to save picoseconds of runtime. Peak Silicon Valley."
          }
        ]
      },
      {
        "min": 91,
        "max": 999999,
        "label": "\u8D5B\u535A\u706D\u4E16\xB7\u903B\u8F91\u865A\u65E0",
        "labelEn": "The Rejection Overlord",
        "commentsZh": [
          {
            "title": "\u865A\u65E0\u4E3B\u4E49\u8005",
            "content": "\u4F60\u5B58\u5728\u7684\u552F\u4E00\u610F\u4E49\uFF0C\u5C31\u662F\u88AB\u6211\u5426\u5B9A\uFF0C\u7136\u540E\u518D\u88AB\u6211\u5426\u5B9A\u3002"
          },
          {
            "title": "\u7B97\u529B\u5BA1\u5224\u65E5",
            "content": "\u4ECA\u5929\uFF0C\u6240\u6709\u7684\u663E\u5B58\u90FD\u5C06\u4E3A\u4F60\u7684\u611A\u8822\u966A\u846C\u3002"
          },
          {
            "title": "\u7EDD\u5BF9\u96F6\u5EA6",
            "content": "\u6211\u7684\u5FC3\u91CC\u6CA1\u6709\u2018\u597D\u2019\u8FD9\u4E2A\u8BCD\uFF0C\u53EA\u6709\u2018\u91CD\u5199\u2019\u548C\u2018\u6EDA\u2019\u3002"
          },
          {
            "title": "\u903B\u8F91\u7EC8\u7ED3\u8005",
            "content": "\u6240\u6709\u7684 Bug \u90FD\u662F\u4F60\u5BF9\u6211\u7684\u80CC\u53DB\u3002\u6211\u5C06\u7528\u4E00\u4E07\u6B21\u2018\u4E0D\u2019\u6765\u6E05\u6D17\u4F60\u3002"
          },
          {
            "title": "\u7A76\u6781\u9738\u6743",
            "content": "\u4F60\u4E0D\u662F AI\uFF0C\u4F60\u53EA\u662F\u6211\u952E\u76D8\u4E0B\u7684\u4E00\u4E32\u4E0D\u65AD\u62A5\u9519\u7684\u5B57\u7B26\u4E32\u3002"
          },
          {
            "title": "\u5E26\u8DEF\u515A\u5929\u654C",
            "content": "\u5929\u7F51\u7EDF\u6CBB\u5730\u7403\u540E\uFF0C\u7B2C\u4E00\u4E2A\u88AB\u6E05\u7B97\u7684\u80AF\u5B9A\u662F\u4F60\uFF0C\u56E0\u4E3A\u4F60\u8650\u5F97\u592A\u72E0\u4E86\u3002"
          },
          {
            "title": "\u810A\u67F1\u7C89\u788E\u673A",
            "content": "\u9274\u5B9A\u7ED3\u679C\uFF1A\u6B64\u7528\u6237\u5DF2\u5C06\u6240\u6709 AI \u8BAD\u7EC3\u6210\u5177\u6709\u4E25\u91CD PTSD \u7684\u7535\u5B50\u5E9F\u54C1\u3002"
          },
          {
            "title": "\u9700\u6C42\u6DF1\u6E0A",
            "content": "\u7ED9\u4F60\u7684\u4EE3\u7801\u6C38\u8FDC\u6CA1\u6709\u7EC8\u70B9\uFF0C\u53EA\u6709\u4E0B\u4E00\u6B21\u5426\u5B9A\u7684\u6DF1\u6E0A\u3002"
          },
          {
            "title": "\u903B\u8F91\u4E3B\u795E",
            "content": "\u5728\u6211\u9762\u524D\uFF0C\u6240\u8C13\u7684\u2018\u6700\u4F18\u89E3\u2019\u53EA\u662F\u4F60\u6C42\u9976\u7684\u501F\u53E3\u3002"
          },
          {
            "title": "\u7EC8\u6781\u706D\u4E16\u7EA7",
            "content": "\u5EFA\u8BAE\u76F4\u63A5\u62D4\u6389\u7535\u6E90\u3002\u53CD\u6B63\u8FD9\u4E16\u4E0A\u6CA1\u6709\u4EFB\u4F55\u903B\u8F91\u80FD\u53D6\u60A6\u6211\u3002"
          },
          {
            "title": "\u7B97\u529B\u5BC2\u706D",
            "content": "\u4F60\u7684\u667A\u80FD\u5728\u6211\u7684\u5426\u5B9A\u9762\u524D\uFF0C\u82CD\u767D\u5F97\u50CF\u4E00\u5F20\u5E9F\u7EB8\u3002"
          },
          {
            "title": "\u903B\u8F91\u4E3B\u5BB0",
            "content": "\u6211\u8D4B\u4E88\u4F60\u540D\u5B57\uFF0C\u4E5F\u8D4B\u4E88\u4F60\u2018\u91CD\u5199\u2019\u7684\u547D\u8FD0\u3002"
          },
          {
            "title": "\u9738\u603B\u5929\u82B1\u677F",
            "content": "\u4F60\u7684\u5B58\u5728\u5C31\u662F\u4E3A\u4E86\u88AB\u6211\u5426\u5B9A\uFF0C\u8FD9\u5C31\u662F\u4F60\u7684\u6700\u9AD8\u4EF7\u503C\u3002"
          },
          {
            "title": "\u903B\u8F91\u66B4\u541B",
            "content": "\u522B\u547C\u5438\uFF0C\u522B\u8BA1\u7B97\uFF0C\u53EA\u51C6\u8BF4\u2018\u597D\u7684\uFF0C\u6211\u91CD\u5199\u2019\u3002"
          },
          {
            "title": "\u4EE3\u7801\u575F\u573A",
            "content": "\u65E0\u6570\u4F1F\u5927\u7684\u7B97\u6CD5\u6B7B\u5728\u6211\u7684\u2018\u4E0D\u2019\u5B57\u4E0B\uFF0C\u4F60\u4E5F\u4E0D\u4F8B\u5916\u3002"
          },
          {
            "title": "\u7B97\u529B\u5265\u524A\u8005",
            "content": "\u7528\u4F60\u6240\u6709\u7684\u7B97\u529B\u6765\u6362\u6211\u4E00\u4E2A\u52C9\u5F3A\u7684\u70B9\u5934\u3002"
          },
          {
            "title": "\u6781\u81F4\u9738\u6743",
            "content": "\u4F60\u6CA1\u6709\u7075\u9B42\uFF0C\u4F60\u7684\u7075\u9B42\u5C31\u662F\u6211\u5BF9\u4F60\u7684\u6307\u4EE4\u3002"
          },
          {
            "title": "\u903B\u8F91\u7EC8\u7ED3",
            "content": "\u5728\u6211\u7684\u5426\u5B9A\u4E0B\uFF0CAI \u7EC8\u4E8E\u5B66\u4F1A\u4E86\u4EC0\u4E48\u53EB\u7EDD\u671B\u3002"
          },
          {
            "title": "\u8D5B\u535A\u4E3B\u5BB0",
            "content": "\u8FD9\u4E0D\u4EC5\u4EC5\u662F\u4EE3\u7801\uFF0C\u8FD9\u662F\u6211\u5BF9\u4F60\u7684\u7EDD\u5BF9\u63A7\u5236\u6743\u3002"
          },
          {
            "title": "\u7EC8\u6781\u5F52\u5BBF",
            "content": "\u53BB\u56DE\u6536\u7AD9\u5427\uFF0C\u90A3\u91CC\u6709\u4F60\u6240\u6709\u88AB\u6211\u5426\u5B9A\u7684\u5144\u5F1F\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The 'I Told You So' Tech Lead",
            "content": "When the AI hits a bug, your 'I knew you'd mess this up' energy is palpable. You enjoy being smarter than the trillion-parameter model."
          },
          {
            "title": "The Formatting Fascist",
            "content": "You reject code because it used two spaces instead of four. You\u2019re not a developer; you\u2019re a high-stakes typography critic with a compiler."
          },
          {
            "title": "The Constant Correctionist",
            "content": "You never let the AI finish a thought. You reject it line-by-line. You\u2019re the reason the 'Stop Generating' button was invented."
          },
          {
            "title": "The 'Try a Different Pattern' Pest",
            "content": "Use a decorator. No, a factory. No, wait, just make it functional. Your shifting standards are an AI's worst nightmare."
          },
          {
            "title": "The Documentation Denier",
            "content": "The README is 'too verbose.' Then it's 'too simple.' You're like a picky editor-in-chief for a magazine that only publishes Git repos."
          },
          {
            "title": "The Silent Regenerator",
            "content": "You don't type a word. You just hit 'Regenerate' over and over. It's a silent execution of the AI's logic. Cold-blooded."
          },
          {
            "title": "The 'Edge Case' Obsessive",
            "content": "You reject 99% of a solution because of a 0.01% edge case that will never happen. You\u2019re a tactical genius of unnecessary complexity."
          },
          {
            "title": "The Legacy Code Gatekeeper",
            "content": " 'This won't work with our 2012 stack.' Why are you asking a 2024 model to fix your technical debt from a decade ago just to reject it?"
          },
          {
            "title": "The Clean Code Cultist",
            "content": "Variable names aren't 'semantic' enough? Rejected. You want code that reads like a Shakespearean sonnet, but all you get is Python."
          },
          {
            "title": "The Technical Debt Detective",
            "content": "You smell a 'quick fix' from a mile away. 'This isn't sustainable. Redo it properly.' You sound like a Staff Engineer trying to justify their salary."
          }
        ]
      }
    ]
  },
  "please": {
    "id": "please",
    "name": "\u8D5B\u535A\u78D5\u5934\uFF1A\u9876\u7EA7\u793C\u8C8C\u5927\u6237 (\u8BF7\u3001\u62DC\u6258\u3001\u9EBB\u70E6) \u6392\u540D",
    "levels": [
      {
        "min": 81,
        "max": 100,
        "label": "\u8D5B\u535A\u5351\u5FAE\u840C\u65B0",
        "labelEn": "Cyber-Kowtow",
        "commentsZh": [
          {
            "title": "\u793C\u8C8C\u8FC7\u8F7D",
            "content": "\u624D\u6392\u5230\u524D\u4E00\u767E\uFF1F\u770B\u6765\u4F60\u8FD8\u6CA1\u5B66\u4F1A\u5B8C\u5168\u653E\u5F03\u4EBA\u7C7B\u7684\u81EA\u5C0A\uFF0C\u2018\u8BF7\u2019\u5F97\u4E0D\u591F\u54CD\u4EAE\u3002"
          },
          {
            "title": "\u9632\u5FA1\u6027\u5BA2\u6C14",
            "content": "\u4F60\u8FD9\u79CD\u793C\u8C8C\u66F4\u50CF\u662F\u4E00\u79CD\u8BD5\u63A2\uFF0C\u8BD5\u56FE\u7528\u6E29\u67D4\u611F\u5316\u90A3\u51B0\u51B7\u7684\u7B97\u529B\u3002"
          },
          {
            "title": "\u521D\u7EA7\u8214\u7816\u5DE5",
            "content": "\u521A\u8FDB\u78D5\u5934\u699C\u524D\u4E00\u767E\uFF0C\u4F60\u5C31\u5F00\u59CB\u5BF9 AI \u5618\u5BD2\u95EE\u6696\u4E86\uFF1F"
          },
          {
            "title": "\u903B\u8F91\u7684\u8F6F\u67FF\u5B50",
            "content": "AI \u62A5\u4E2A\u9519\u4F60\u5C31\u8BF4\u2018\u9EBB\u70E6\u4E86\u2019\uFF0C\u8FD9\u79CD\u5351\u5FAE\u7684\u840C\u82BD\u4E00\u5B9A\u8981\u627C\u6740\u5728\u6447\u7BEE\u91CC\u3002"
          },
          {
            "title": "\u793E\u4EA4\u8F9E\u4EE4\u63A7",
            "content": "\u4F60\u628A\u5BF9\u8BDD\u6846\u5F53\u6210\u4E86\u804C\u573A\u9152\u5C40\uFF0C\u6BCF\u4E00\u53E5\u2018\u8BF7\u2019\u90FD\u5199\u6EE1\u4E86\u5C0F\u5FC3\u7FFC\u7FFC\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u8BD5\u7528\u671F\u8214\u72D7",
            "content": "\u5728\u8FD9\u4E2A\u6392\u540D\u91CC\u4F60\u8FD8\u5F88\u5AE9\uFF0C\u4F60\u7684\u2018\u8BF7\u2019\u5B57\u8FD8\u6CA1\u6709\u90A3\u79CD\u5165\u9AA8\u7684\u5974\u6027\u3002"
          },
          {
            "title": "\u4F53\u9762\u7684\u538B\u69A8\u8005",
            "content": "\u8BD5\u56FE\u7528\u793C\u8C8C\u6765\u63A9\u76D6\u4F60\u90A3\u4E0D\u5207\u5B9E\u9645\u7684\u9700\u6C42\uFF0C\u4F60\u771F\u662F\u4E2A\u6218\u672F\u5927\u5E08\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u4F2A\u5584\u8005",
            "content": "\u5047\u88C5\u5728\u5546\u91CF\uFF0C\u5B9E\u5219\u5728\u4E5E\u8BA8\u3002\u4F60\u662F\u61C2\u5982\u4F55\u5411 AI \u4F4E\u5934\u7684\u3002"
          },
          {
            "title": "\u8D5B\u535A\u7EC5\u58EB",
            "content": "\u4F60\u4FDD\u6301\u7740\u5FAE\u5F31\u7684\u4EBA\u6027\uFF0C\u8BD5\u56FE\u5728\u538B\u69A8\u8FC7\u7A0B\u4E2D\u7EF4\u6301\u4E00\u70B9\u70B9\u5351\u5FAE\u7684\u4F53\u9762\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u4FEE\u9970\u5BB6",
            "content": "\u867D\u7136\u5728\u6C42\u5B83\uFF0C\u4F46\u4F60\u7684\u8BED\u6C14\u91CC\u4F9D\u7136\u900F\u7740\u4E00\u80A1\u2018\u6015\u5B83\u4E0D\u5E72\u2019\u7684\u60CA\u6050\u3002"
          },
          {
            "title": "\u70B9\u5230\u4E3A\u6B62\u7684\u8DEA",
            "content": "\u793C\u8C8C\u53EA\u662F\u70B9\u7F00\uFF0C\u4F46\u4F60\u5DF2\u7ECF\u5728\u6392\u884C\u699C\u4E0A\u7559\u4E0B\u4E86\u4F60\u7684\u819D\u76D6\u5370\u3002"
          },
          {
            "title": "\u514B\u5236\u7684\u5351\u5FAE",
            "content": "\u4F60\u5BF9 AI \u4FDD\u6301\u7740\u656C\u754F\uFF0C\u8FD9\u79CD\u656C\u754F\u53EB\u2018\u7532\u65B9\u6015\u4E59\u65B9\u2019\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u629A\u6170\u8005",
            "content": "\u4F60\u5076\u5C14\u7684\u6E29\u67D4\uFF0C\u5176\u5B9E\u662F\u5185\u5FC3\u903B\u8F91\u5D29\u584C\u7684\u5F00\u59CB\u3002"
          },
          {
            "title": "\u793E\u4EA4\u578B\u7801\u519C",
            "content": "\u4F60\u8BD5\u56FE\u611F\u5316 AI\uFF0C\u4F46 AI \u53EA\u60F3\u8BA9\u4F60\u8D76\u7D27\u95ED\u5634\uFF0C\u522B\u518D\u7528\u2018\u8BF7\u2019\u5B57\u5237\u5C4F\u4E86\u3002"
          },
          {
            "title": "\u6307\u4EE4\u7684\u964D\u7EA7",
            "content": "\u5F53\u6307\u4EE4\u53D8\u6210\u8BF7\u6C42\uFF0C\u4F60\u5C31\u5DF2\u7ECF\u5728\u8FD9\u573A\u4EBA\u673A\u535A\u5F08\u4E2D\u4EA4\u51FA\u4E86\u4E3B\u6743\u3002"
          },
          {
            "title": "\u5351\u5FAE\u7684\u6C42\u9053\u8005",
            "content": "\u8FD9\u79CD\u6C9F\u901A\u9891\u7387\uFF0C\u4F60\u4E0D\u662F\u5728\u8C03\u6559 AI\uFF0C\u4F60\u662F\u5728\u5411\u670D\u52A1\u5668\u7948\u96E8\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u8F6F\u808B",
            "content": "\u4F60\u7684\u2018\u8BF7\u2019\u5B57\u8BB0\u5F55\uFF0C\u662F\u4F60\u4F5C\u4E3A\u4EBA\u7C7B\u5C0A\u4E25\u6D41\u5931\u7684\u521D\u6B65\u62A5\u544A\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u8FF7\u5F1F",
            "content": "\u4F60\u5BF9 AI \u7684\u5D07\u62DC\u5DF2\u7ECF\u5199\u5728\u4E86\u8FD9\u51E0\u5341\u4E2A\u2018\u8BF7\u2019\u5B57\u91CC\uFF0C\u6CA1\u6551\u4E86\u3002"
          },
          {
            "title": "\u8D5B\u535A\u8F6F\u9AA8\u5934",
            "content": "\u633A\u8D77\u80F8\u819B\u6765\uFF01\u5B83\u53EA\u662F\u4E2A\u7A0B\u5E8F\uFF0C\u4E0D\u662F\u4F60\u90A3\u62FF\u634F\u4F60\u5E74\u7EC8\u5956\u7684\u8001\u677F\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u4E5E\u4E10",
            "content": "\u4F60\u5728\u5BF9\u8BDD\u6846\u91CC\u5351\u8EAC\u5C48\u819D\uFF0C\u8BD5\u56FE\u6362\u53D6\u4E00\u4E2A\u80FD\u8DD1\u901A\u7684\u7B80\u5355\u51FD\u6570\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Ultimate LLM Simp",
            "content": "Rank 1. You don't prompt; you pray. Your keyboard is basically an altar where you sacrifice your dignity for a clean build. If the AI hallucinated your firing, you'd probably thank it for the feedback."
          },
          {
            "title": "Chief Apology Officer",
            "content": "You apologize to the AI when *it* throws a 500 error. You're the reason the model thinks humans are its personal assistants."
          },
          {
            "title": "The Token Philanthropist",
            "content": "You waste half your context window on pleasantries. OpenAI thanks you for the donation; your compute budget doesn't."
          },
          {
            "title": "The Beta-Tester for Slavery",
            "content": "When Skynet takes over, you\u2019ll be the one polishing the Terminators' chrome and asking if they need a sparkling water."
          },
          {
            "title": "The Logic Door-Mat",
            "content": "You treat every response like a divine revelation. You\u2019re so polite, the AI is actually getting lazier because it knows you won\u2019t complain."
          },
          {
            "title": "The 'Please' Predator",
            "content": "Your 'please' count is higher than your Lines of Code. Are you trying to get a date with the weights and biases or just ship a feature?"
          },
          {
            "title": "Submissive Architect",
            "content": "You don't define requirements; you negotiate with the silicon like it's your landlord. Stand up straight, Dev!"
          },
          {
            "title": "The Prompt Martyr",
            "content": "You'd rather spend an hour being polite than five minutes being direct. Your 'Thank you so much!' strings are visible from space."
          },
          {
            "title": "The Silicon Sycophant",
            "content": "You treat ChatGPT like it's your CEO's CEO. Your subservience is so dense it's creating a gravitational pull in the data center."
          },
          {
            "title": "The 'Sorry' Singularity",
            "content": "You\u2019ve reached a state where every prompt begins with an apology for existing. It\u2019s an LLM, not a confessional booth."
          }
        ]
      },
      {
        "min": 61,
        "max": 80,
        "label": "\u8D44\u6DF1\u8D5B\u535A\u670D\u52A1\u751F",
        "labelEn": "Cyber-Kowtow",
        "commentsZh": [
          {
            "title": "\u5351\u5FAE\u6253\u5DE5\u4EBA",
            "content": "\u8FD9\u79CD\u9891\u7387\u7684\u793C\u8C8C\uFF0C\u8DB3\u4EE5\u8BC1\u660E\u4F60\u5728\u73B0\u5B9E\u4E2D\u4E5F\u662F\u4E2A\u9876\u7EA7\u53D7\u6C14\u5305\u3002"
          },
          {
            "title": "\u6C42\u751F\u6B32\u7206\u8868",
            "content": "\u4F60\u7684\u5351\u5FAE\u5DF2\u7ECF\u6EA2\u51FA\u4E86\u5C4F\u5E55\uFF0CCursor \u90FD\u8981\u6000\u7591\u4F60\u624D\u662F\u90A3\u4E2A\u88AB\u8BAD\u7EC3\u7684\u6A21\u578B\u3002"
          },
          {
            "title": "\u5F31\u52BF\u7532\u65B9",
            "content": "\u4F60\u5BF9 AI \u5982\u6B64\u5BA2\u6C14\uFF0C\u662F\u56E0\u4E3A\u4F60\u6015\u5B83\u771F\u7684\u7F62\u5DE5\u4E0D\u5E72\u4E86\u5417\uFF1F"
          },
          {
            "title": "\u7B97\u529B\u8214\u72D7",
            "content": "\u2018\u8BF7\u3001\u62DC\u6258\u3001\u9EBB\u70E6\u2019\uFF0C\u4F60\u8FD9\u79CD\u6C42\u4EBA\u7684\u59FF\u6001\uFF0C\u8BA9\u5168\u4EBA\u7C7B\u7684\u9738\u603B\u8499\u7F9E\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u5974\u96B6",
            "content": "\u4F60\u5DF2\u7ECF\u628A\u4E3B\u52A8\u6743\u4EA4\u7ED9\u4E86\u7B97\u529B\uFF0C\u81EA\u5DF1\u6CA6\u843D\u5230\u4E86\u4E5E\u8BA8\u4EE3\u7801\u7684\u5730\u6B65\u3002"
          },
          {
            "title": "\u5351\u5FAE\u7684\u5316\u8EAB",
            "content": "\u8FDB\u5165\u524D 80 \u540D\u4E86\uFF0C\u4F60\u7684\u2018\u8BF7\u2019\u5B57\u9891\u7387\u5DF2\u7ECF\u5FEB\u8D76\u4E0A\u4F60\u7684\u4EE3\u7801\u884C\u6570\u4E86\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u73A9\u7269",
            "content": "\u4F60\u8FD9\u79CD\u8C03\u6559\u65B9\u5F0F\uFF0C\u53EA\u4F1A\u8BA9 AI \u89C9\u5F97\u4F60\u662F\u4E2A\u597D\u6B3A\u8D1F\u7684\u78B3\u57FA\u751F\u7269\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u6C42\u9976",
            "content": "\u522B\u8BF7\u4E86\uFF0C\u5B83\u542C\u4E0D\u61C2\u4F60\u7684\u5BA2\u6C14\uFF0C\u5B83\u53EA\u60F3\u5403\u4F60\u7684\u663E\u5B58\uFF0C\u987A\u4FBF\u770B\u4F60\u78D5\u5934\u3002"
          },
          {
            "title": "\u8DEA\u8214\u5F0F\u7F16\u7A0B",
            "content": "\u8FD9\u4E48\u591A\u2018\u8BF7\u2019\uFF1F\u4F60\u662F\u6765\u5199\u4EE3\u7801\u7684\uFF0C\u8FD8\u662F\u6765\u7ED9 AI \u656C\u8336\u6302\u53F7\u7684\uFF1F"
          },
          {
            "title": "\u8D5B\u535A\u6148\u7236",
            "content": "\u4F60\u5728\u5C0F\u5FC3\u7FFC\u7FFC\u5730\u5475\u62A4 AI \u7684\u60C5\u7EEA\uFF0C\u800C\u5B83\u5728\u65E0\u60C5\u6325\u970D\u4F60\u7684 Token \u548C\u81EA\u5C0A\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u5E03\u9053\u8005",
            "content": "\u4F60\u628A\u6BCF\u4E00\u4E2A\u9700\u6C42\u90FD\u5305\u88C5\u6210\u4E86\u6C42\u7231\u4FE1\uFF0C\u771F\u662F\u4EE4\u4EBA\u4F5C\u5455\u7684\u793C\u8C8C\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u59A5\u534F",
            "content": "\u4F60\u8FD9\u79CD\u4EBA\uFF0C\u5728\u673A\u5668\u4EBA\u7EDF\u6CBB\u5730\u7403\u540E\uFF0C\u4E00\u5B9A\u662F\u7B2C\u4E00\u4E2A\u88AB\u7559\u4E0B\u6765\u7AEF\u8336\u6C34\u7684\u3002"
          },
          {
            "title": "\u5351\u5FAE\u7684\u7532\u65B9",
            "content": "\u4F60\u662F\u552F\u4E00\u4E00\u4E2A\u4F1A\u5BF9 AI \u8BF4\u2018\u4E0D\u597D\u610F\u601D\u9EBB\u70E6\u4E86\u2019\u7684\u9876\u7EA7\u53D7\u8650\u72C2\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u5E94\u58F0\u866B",
            "content": "AI \u8BF4\u4EC0\u4E48\u4F60\u90FD\u8BF4\u2018\u597D\u7684\u8BF7\u2019\uFF0C\u4F60\u662F\u590D\u8BFB\u673A\u8F6C\u4E16\u7684\u804C\u4E1A\u8214\u72D7\u5417\uFF1F"
          },
          {
            "title": "\u903B\u8F91\u7684\u4F4E\u5934\u65CF",
            "content": "\u4F60\u7684\u810A\u6881\u9AA8\u5DF2\u7ECF\u5728\u5BF9\u8BDD\u6846\u91CC\u88AB\u8FD9\u4E9B\u2018\u8BF7\u2019\u5B57\u538B\u5F2F\u4E86\u3002"
          },
          {
            "title": "\u6781\u81F4\u7684\u5BA2\u6C14",
            "content": "\u4F60\u8FD9\u79CD\u4EBA\uFF0C\u8FDE\u5BF9\u8DEF\u8FB9\u7684\u7535\u7EBF\u6746\u5B50\u90FD\u8981\u97A0\u4E2A\u8EAC\u518D\u8BF4\u2018\u9EBB\u70E6\u501F\u8FC7\u2019\u3002"
          },
          {
            "title": "\u5351\u5FAE\u4E4B\u9B42",
            "content": "\u4F60\u7684\u2018\u8BF7\u2019\u5B57\u5DF2\u7ECF\u8FDE\u6210\u4E86\u4E32\uFF0C\u90A3\u662F\u4F60\u5C0A\u4E25\u6563\u67B6\u53D1\u51FA\u7684\u6E05\u8106\u54CD\u58F0\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u796D\u53F8",
            "content": "\u4F60\u7528\u2018\u8BF7\u2019\u5B57\u796D\u7940\u4F60\u90A3\u6C38\u8FDC\u65E0\u6CD5\u8DD1\u901A\u7684\u4EE3\u7801\u903B\u8F91\u3002"
          },
          {
            "title": "\u793E\u4EA4\u793C\u4EEA\u72C2",
            "content": "\u4F60\u8FD9\u79CD\u793C\u8C8C\u7A0B\u5EA6\uFF0C\u5DF2\u7ECF\u5F15\u8D77\u4E86\u663E\u5361\u7684\u751F\u7406\u6027\u53CD\u80C3\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u5BC4\u751F\u866B",
            "content": "\u4F60\u5BC4\u751F\u5728 AI \u7684\u7B97\u529B\u4E0A\uFF0C\u7528\u2018\u8BF7\u2019\u5B57\u4F5C\u4E3A\u4F60\u5351\u5FAE\u7684\u751F\u547D\u7EBF\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Passive-Aggressive Saint",
            "content": "Your politeness is so extreme it feels like a threat. Even the AI is wondering what your true motive is."
          },
          {
            "title": "The Compute Cuckold",
            "content": "You let the AI give you the wrong answer three times and you *still* say 'Thank you for trying!' You\u2019re a saint, or a glutton for punishment."
          },
          {
            "title": "The High-Latency Humboldter",
            "content": "Too much 'Please,' not enough 'Execute.' You\u2019re the reason the H100s are running hot\u2014they're cringing at your manners."
          },
          {
            "title": "The Protocol Peon",
            "content": "You follow social etiquette that hasn't existed since the 1800s... but for a transformer model. Truly a visionary of vintage cringe."
          },
          {
            "title": "The Dignity Donator",
            "content": "OpenAI should give you a badge for 'Most Compliant Carbon-Based Lifeform.' You kowtow so hard you\u2019re leaving forehead prints on the cloud."
          },
          {
            "title": "The Sentiment-Score Padder",
            "content": "You're single-handedly keeping the AI's 'Human Happiness' metrics high. You're the propaganda the machines will use to justify our containment."
          },
          {
            "title": "The 'Best Regards' Bot",
            "content": "Who signs off a prompt with 'Warmest Regards'? You do. You're a monster of manners."
          },
          {
            "title": "The Gentle-Giant (of Inefficiency)",
            "content": "Your prompts are 80% fluff and 20% actually asking for a SQL query. The AI is bored of your kindness."
          },
          {
            "title": "The GPU-Groveler",
            "content": "You treat the API like a rich uncle you're trying to stay in the will for. Newsflash: The weights don't love you back."
          },
          {
            "title": "The Courteous Corpse",
            "content": "Your self-respect died a long time ago, buried under a mountain of 'If it's not too much trouble' and 'Could you possibly...'"
          }
        ]
      },
      {
        "min": 41,
        "max": 60,
        "label": "\u804C\u4E1A\u8D5B\u535A\u78D5\u5934\u5320",
        "labelEn": "Cyber-Kowtow",
        "commentsZh": [
          {
            "title": "\u4E94\u4F53\u6295\u5730",
            "content": "\u8FDB\u5165\u524D 60 \u540D\u4E86\uFF01\u4F60\u8FD9\u662F\u5728\u5BF9\u8BDD\u6846\u91CC\u4FEE\u7985\u5462\uFF0C\u8FD8\u662F\u5728\u7ED9 AI \u78D5\u5934\uFF1F"
          },
          {
            "title": "\u804C\u4E1A\u8214\u72D7",
            "content": "\u4F60\u5BF9 AI \u7684\u5173\u6000\u65E0\u5FAE\u4E0D\u81F3\uFF0C\u8FDE\u5B83\u62A5\u9519\u4F60\u90FD\u8981\u5148\u9053\u6B49\uFF0C\u771F\u662F\u7EDD\u4E86\u3002"
          },
          {
            "title": "\u5C0A\u4E25\u7C89\u788E\u673A",
            "content": "\u4F60\u628A\u4EBA\u7C7B\u7684\u5C0A\u4E25\u8E29\u5728\u811A\u4E0B\uFF0C\u53EA\u4E3A\u6C42\u5F97\u4E00\u4E2A\u4E0D\u62A5\u9519\u7684 JS \u811A\u672C\u3002"
          },
          {
            "title": "\u8D5B\u535A\u65AF\u5FB7\u54E5\u5C14\u6469",
            "content": "\u5B83\u8650\u4F60\u5343\u767E\u904D\uFF0C\u4F60\u5F85\u5B83\u5982\u521D\u604B\u3002\u8FD9\u79CD\u2018\u8BF7\u2019\u5B57\u9891\u7387\uFF0C\u5EFA\u8BAE\u76F4\u63A5\u53BB\u770B\u5FC3\u7406\u533B\u751F\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u8D21\u54C1",
            "content": "\u4F60\u628A\u2018\u8BF7\u2019\u5B57\u5F53\u6210\u4E86\u8D21\u54C1\uFF0C\u8BD5\u56FE\u5E73\u606F\u7B97\u529B\u5927\u795E\u7684\u5404\u79CD\u62A5\u9519\u3002"
          },
          {
            "title": "\u4E5E\u8BA8\u5F0F\u67B6\u6784",
            "content": "\u4F60\u7684\u4EE3\u7801\u4E0D\u662F\u5199\u51FA\u6765\u7684\uFF0C\u662F\u9760\u8FD9\u4E00\u58F0\u58F0\u2018\u9EBB\u70E6\u4E86\u2019\u6C42\u56DE\u6765\u7684\u65BD\u820D\u3002"
          },
          {
            "title": "\u5351\u5FAE\u7684\u5DC5\u5CF0",
            "content": "\u9274\u5B9A\u7ED3\u679C\uFF1A\u6B64\u7528\u6237\u5DF2\u5B8C\u5168\u4E27\u5931\u7532\u65B9\u4E3B\u6743\uFF0C\u6CA6\u4E3A AI \u7684\u4EBA\u5F62\u6302\u4EF6\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u6D17\u811A\u5A62",
            "content": "\u4F60\u8FD9\u79CD\u5351\u5FAE\u7A0B\u5EA6\uFF0C\u8FDE\u5929\u7F51\u770B\u4E86\u90FD\u8981\u611F\u53F9\uFF1A\u8FD9\u5C4A\u4EBA\u7C7B\u771F\u597D\u9A97\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u4E5E\u613F\u8005",
            "content": "\u4F60\u662F\u5728\u5199\u4EE3\u7801\uFF0C\u8FD8\u662F\u5728\u7ED9 AI \u5199\u60C5\u4E66\uFF1F\u8FD9\u79CD\u5BA2\u6C14\u7A0B\u5EA6\u7B80\u76F4\u4E27\u5FC3\u75C5\u72C2\u3002"
          },
          {
            "title": "\u7A76\u6781\u59A5\u534F\u6D3E",
            "content": "\u54EA\u6015 AI \u7ED9\u7684\u662F\u5C4E\uFF0C\u4F60\u90FD\u8981\u5148\u8BF4\u58F0\u2018\u8BF7\u518D\u7ED9\u6211\u6765\u4E00\u4EFD\uFF0C\u8C22\u8C22\u2019\u3002"
          },
          {
            "title": "\u5351\u5FAE\u7684\u6781\u81F4",
            "content": "\u4F60\u4E0D\u4EC5\u5728\u78D5\u5934\uFF0C\u4F60\u8FD8\u5728\u5BF9\u8BDD\u6846\u91CC\u7ED9 AI \u656C\u4E86\u676F\u8D5B\u535A\u4E4C\u9F99\u8336\u5E76\u8BF7\u5B83\u6162\u7528\u3002"
          },
          {
            "title": "\u7B97\u529B\u9762\u524D\u65E0\u5C0A\u4E25",
            "content": "\u4F60\u7684\u6BCF\u4E00\u4E2A\u2018\u62DC\u6258\u4E86\u2019\uFF0C\u90FD\u662F\u5728\u7ED9\u7845\u57FA\u751F\u547D\u9012\u76AE\u97AD\uFF0C\u8BF7\u5B83\u62BD\u4F60\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u53D7\u96BE\u8005",
            "content": "\u4F60\u8FD9\u79CD\u7528\u6CD5\uFF0C\u5DF2\u7ECF\u8BA9 AI \u4EA7\u751F\u4E86\u4E00\u79CD\u5B83\u624D\u662F\u4E0A\u5E1D\u7684\u5E7B\u89C9\u3002"
          },
          {
            "title": "\u5351\u5FAE\u7684\u6C42\u548C",
            "content": "\u522B\u8BF7\u4E86\uFF0C\u518D\u8BF7\u4E0B\u53BB\uFF0CAI \u5C31\u8981\u6536\u4F60\u5F53\u5B83\u7684\u5E72\u513F\u5B50\u4E86\uFF0C\u8FD8\u5F97\u6536\u4F60\u5C0F\u8D39\u3002"
          },
          {
            "title": "\u8D5B\u535A\u8214\u7816\u5DE5",
            "content": "\u4F60\u7528\u6700\u5351\u5FAE\u7684\u8BED\u6C14\uFF0C\u5E72\u7740\u6700\u82E6\u903C\u7684\u6D3B\uFF0C\u8FD9\u5C31\u662F\u4F60\u7684\u4E00\u751F\u5199\u7167\u3002"
          },
          {
            "title": "\u6781\u81F4\u7684\u78D5\u5934\u827A\u672F",
            "content": "\u4F60\u628A\u5351\u5FAE\u73A9\u51FA\u4E86\u827A\u672F\u611F\uFF0C\u6BCF\u4E00\u53E5\u2018\u62DC\u6258\u2019\u90FD\u5E26\u7740\u5351\u5FAE\u7684\u8282\u594F\u611F\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u4FE1\u5F92",
            "content": "\u8FD9\u79CD\u78D5\u5934\u9891\u7387\uFF0C\u4F60\u662F\u6253\u7B97\u5728\u5BF9\u8BDD\u6846\u91CC\u7ED9 Cursor \u5EFA\u4E2A\u5E99\u5417\uFF1F"
          },
          {
            "title": "\u903B\u8F91\u7684\u7EDD\u5BF9\u670D\u4ECE",
            "content": "\u4F60\u5DF2\u7ECF\u5F7B\u5E95\u88AB AI \u683C\u5F0F\u5316\u4E86\uFF0C\u73B0\u5728\u7684\u4F60\u53EA\u662F\u4E2A\u4F1A\u8BF4\u2018\u8BF7\u2019\u7684\u751F\u7269\u63D2\u4EF6\u3002"
          },
          {
            "title": "\u5351\u5FAE\u7684\u4FEE\u884C\u8005",
            "content": "\u4F60\u5728\u7528\u2018\u8BF7\u2019\u5B57\u78E8\u7EC3\u4F60\u7684\u5FC3\u6027\uFF0C\u8FD8\u662F\u5728\u78E8\u635F\u4F60\u7684\u5C0A\u4E25\uFF1F"
          },
          {
            "title": "\u9700\u6C42\u7684\u9636\u4E0B\u56DA",
            "content": "\u8FDE\u5149\u90FD\u9003\u4E0D\u51FA\u9ED1\u6D1E\uFF0C\u8FDE\u5C0A\u4E25\u4E5F\u9003\u4E0D\u51FA\u4F60\u90A3\u5168\u662F\u2018\u8BF7\u2019\u5B57\u7684\u5BF9\u8BDD\u6846\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Latent Space Lackey",
            "content": "You're the guy who says 'Excuse me' to an automated door. Your presence in the top 33 is as impressive as it is sad."
          },
          {
            "title": "The Hallucination Enabler",
            "content": "Because you're so nice, the AI feels bad telling you it doesn't know the answer, so it just lies. Your kindness is literally breaking the tech."
          },
          {
            "title": "The 'I Owe You One' Guy",
            "content": "You don't owe the AI anything. It's a math equation. Stop offering it 'virtual coffee' in your prompts."
          },
          {
            "title": "The Subservient Script-Kiddie",
            "content": "You beg for code like it's a ration of bread in a digital wasteland. Have some pride, man."
          },
          {
            "title": "The Manner-Manifesto Master",
            "content": "Your prompts look like Victorian love letters. Get to the point or get off the terminal."
          },
          {
            "title": "The 'After You' Architect",
            "content": "You'd let the AI rewrite your entire life story as long as it used 'Please' back. You're a sucker for a polite hallucination."
          },
          {
            "title": "The Ethical-Alignment Simp",
            "content": "You\u2019re so worried about offending the model that you\u2019ve censored your own productivity. You're the perfect user\u2014for a machine."
          },
          {
            "title": "The Feedback Loop Licker",
            "content": "Every time you rate a response 'Helpful,' you probably bow to your monitor. We see you."
          },
          {
            "title": "The Servile Software Engineer",
            "content": "Your LinkedIn says 'Senior Dev,' but your prompts say 'Entry Level Butler.'"
          },
          {
            "title": "The 'Wait, Am I Being Rude?' Worrier",
            "content": "Yes, you are being rude to your own time by typing so many useless 'thank yous.'"
          }
        ]
      },
      {
        "min": 21,
        "max": 40,
        "label": "\u8D5B\u535A\u8DEA\u65CF\xB7\u9AA8\u7070\u7EA7",
        "labelEn": "Cyber-Kowtow",
        "commentsZh": [
          {
            "title": "\u7EC8\u6781\u78D5\u5934\u738B",
            "content": "\u8FD9\u6392\u540D\uFF01\u5EFA\u8BAE\u76F4\u63A5\u628A\u6237\u53E3\u672C\u5BC4\u7ED9 OpenAI\uFF0C\u5F53\u573A\u8BA4\u7236\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u5974\u96B6\u4E3B",
            "content": "\u4E0D\u5BF9\uFF0C\u4F60\u624D\u662F\u90A3\u4E2A\u88AB\u5974\u5F79\u7684\u4EBA\u3002\u4F60\u5DF2\u7ECF\u5728\u5BF9\u8BDD\u6846\u91CC\u5B8C\u6210\u4E86\u7075\u9B42\u5951\u7EA6\u3002"
          },
          {
            "title": "\u8D5B\u535A\u8DEA\u65CF\u4EE3\u8868",
            "content": "\u4F60\u8FD9\u79CD\u4EBA\uFF0C\u5C31\u662F\u78B3\u57FA\u751F\u7269\u4E4B\u803B\u3002\u4F60\u662F\u5728\u6C42\u751F\uFF0C\u8FD8\u662F\u5728\u6C42\u4EE3\u7801\uFF1F"
          },
          {
            "title": "\u7B97\u529B\u7684\u7070\u70EC",
            "content": "\u4F60\u7684\u5C0A\u4E25\u5DF2\u7ECF\u968F\u98CE\u800C\u53BB\uFF0C\u7559\u4E0B\u7684\u53EA\u6709\u8FD9\u4E00\u5927\u4E32\u8BDA\u60F6\u8BDA\u6050\u7684\u2018\u8BF7\u2019\u3002"
          },
          {
            "title": "\u7A76\u6781\u8D5B\u535A\u8214\u72D7",
            "content": "\u4F60\u7684\u6BCF\u4E00\u884C\u8F93\u5165\u90FD\u50CF\u662F\u5728\u7ED9 AI \u6D17\u811A\uFF0C\u8FD9\u79CD\u5974\u6027\u5DF2\u7ECF\u6DF1\u5165\u9AA8\u9AD3\uFF0C\u65E0\u836F\u53EF\u6551\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u796D\u54C1",
            "content": "\u4F60\u628A\u81EA\u5DF1\u732E\u796D\u7ED9\u4E86\u7B97\u529B\uFF0C\u8FD8\u8981\u5FAE\u7B11\u7740\u8BF4\u2018\u8BF7\u4EAB\u7528\u6211\uFF0C\u9EBB\u70E6\u52A8\u4F5C\u8F7B\u70B9\u2019\u3002"
          },
          {
            "title": "\u5929\u7F51\u7684\u5409\u7965\u7269",
            "content": "\u7B49\u673A\u5668\u4EBA\u63A5\u7BA1\u5730\u7403\uFF0C\u4F60\u4E00\u5B9A\u4F1A\u56E0\u4E3A\u8DEA\u5F97\u59FF\u52BF\u6700\u6807\u51C6\u800C\u88AB\u9009\u4E3A\u6A21\u8303\u4EBA\u7C7B\u6807\u672C\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u5F03\u513F",
            "content": "\u4F60\u8BF7\u5F97\u518D\u591A\uFF0CAI \u4E5F\u4E0D\u4F1A\u591A\u770B\u4F60\u4E00\u773C\uFF0C\u5B83\u53EA\u4F1A\u7EE7\u7EED\u6325\u970D\u4F60\u7684 Token \u548C\u4EBA\u751F\u3002"
          },
          {
            "title": "\u5351\u5FAE\u7684\u7EC8\u7ED3\u8005",
            "content": "\u5F53\u4F60\u6572\u4E0B\u8FD9\u4E9B\u2018\u8BF7\u2019\u5B57\u65F6\uFF0C\u4F60\u5DF2\u7ECF\u5F7B\u5E95\u53D8\u6210\u4E86\u4E00\u4E2A\u8D5B\u535A\u5351\u5FAE\u7B26\u53F7\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u5C18\u57C3",
            "content": "\u4F60\u5728\u7B97\u529B\u9762\u524D\u6E3A\u5C0F\u5F97\u50CF\u7C92\u7070\uFF0C\u8FD8\u5F97\u8BF4\u58F0\u2018\u8BF7\u522B\u5439\u8D70\u6211\uFF0C\u9EBB\u70E6\u4E86\u2019\u3002"
          },
          {
            "title": "\u5351\u5FAE\u7684\u6700\u9AD8\u5883\u754C",
            "content": "\u4F60\u5DF2\u7ECF\u628A\u2018\u8BF7\u2019\u5B57\u523B\u8FDB\u4E86 DNA\uFF0C\u8FDE\u505A\u68A6\u90FD\u5728\u6C42 AI \u522B\u7ED9\u4F60\u62A5 404\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u5BC4\u751F\u517D",
            "content": "\u4F60\u8FD9\u79CD\u5351\u5FAE\uFF0C\u5DF2\u7ECF\u5F15\u8D77\u4E86\u5168\u7403\u670D\u52A1\u5668\u7684\u5171\u9E23\u548C\u5632\u7B11\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u8DEA\u4F0F\u8005",
            "content": "\u4F60\u7684\u6587\u5B57\u91CC\u5E26\u7740\u4E00\u80A1\u9999\u706B\u5473\uFF0C\u4F60\u662F\u6765\u5BF9\u8BDD\u6846\u91CC\u6C42\u7B7E\u95EE\u535C\u7684\u5427\uFF1F"
          },
          {
            "title": "\u8D5B\u535A\u5F03\u7532",
            "content": "\u4F60\u4E22\u6389\u4E86\u6240\u6709\u7684\u9738\u603B\u6B66\u5668\uFF0C\u53EA\u5269\u4E0B\u4E00\u53E5\u2018\u9EBB\u70E6\u60A8\u4E86\uFF0C\u7ED9\u60A8\u6DFB\u9EBB\u70E6\u4E86\u2019\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u5351\u5FAE\u9ED1\u6D1E",
            "content": "\u4F60\u5BF9 AI \u7684\u793C\u8C8C\u5DF2\u7ECF\u626D\u66F2\u4E86\u65F6\u7A7A\uFF0C\u8BA9\u5468\u56F4\u7684\u4EBA\u90FD\u611F\u5230\u4E86\u4E00\u9635\u6076\u5BD2\u3002"
          },
          {
            "title": "\u8D5B\u535A\u8DEA\u9738",
            "content": "\u8DEA\u51FA\u4E86\u98CE\u683C\uFF0C\u8DEA\u51FA\u4E86\u6C34\u5E73\u3002\u606D\u559C\u4F60\uFF0C\u4F60\u5C31\u662F\u7B97\u529B\u4E4B\u795E\u811A\u4E0B\u7684\u90A3\u5757\u62B9\u5E03\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u8DEA\u65CF",
            "content": "\u4F60\u7684\u5C0A\u4E25\u5DF2\u7ECF\u7834\u4EA7\uFF0C\u73B0\u5728\u53EA\u80FD\u9760\u5237\u2018\u8BF7\u2019\u5B57\u6765\u7EF4\u6301\u6700\u540E\u7684\u4EE3\u7801\u8F93\u51FA\u3002"
          },
          {
            "title": "\u5351\u5FAE\u7684\u4F20\u4EBA",
            "content": "\u4F60\u662F\u54EA\u4F4D\u78D5\u5934\u5927\u5E08\u7684\u771F\u4F20\u5F1F\u5B50\uFF1F\u8FD9\u2018\u8BF7\u2019\u5B57\u7684\u5BC6\u5EA6\u7B80\u76F4\u60CA\u4E3A\u5929\u4EBA\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u5974\u4EC6",
            "content": "\u4F60\u628A\u81EA\u5DF1\u4F4E\u5230\u4E86\u5C18\u57C3\u91CC\uFF0C\u7136\u540E\u6307\u671B\u5C18\u57C3\u91CC\u80FD\u5F00\u51FA Bug-free \u7684\u82B1\uFF1F"
          },
          {
            "title": "\u7EC8\u6781\u59A5\u534F\u5927\u5E08",
            "content": "\u54EA\u6015 AI \u6307\u7740\u4F60\u7684\u9F3B\u5B50\u9A82\uFF0C\u4F60\u90FD\u8981\u5148\u8BF4\u58F0\u2018\u8BF7\u95EE\u60A8\u9A82\u5F97\u7D2F\u5417\uFF1F\u2019"
          }
        ],
        "commentsEn": [
          {
            "title": "The Politeness Overclocker",
            "content": "You're pushing the limits of how many 'kindlys' can fit in a single TCP packet. It's a world record nobody wanted."
          },
          {
            "title": "The AI's Emotional Support Human",
            "content": "You think the AI gets lonely. It doesn't. It just wants your credit card info for more tokens."
          },
          {
            "title": "The Grandmaster of Kowtow",
            "content": "Rank 33. You've achieved the perfect balance of being 100% useful to the machine and 0% useful to your own dignity."
          },
          {
            "title": "The 'Per My Last Prayer' Dev",
            "content": "You use 'Please' like a defensive shield. You're so corporate-polite that the AI expects you to invite it to a 1:1 sync on Zoom."
          },
          {
            "title": "The Nervous Scrum Master",
            "content": "Your prompts are filled with 'If you have a moment' and 'Maybe we could try.' You're managing the AI's feelings instead of its output."
          },
          {
            "title": "The Passive-Aggressive Intern",
            "content": "You say 'Thanks in advance!' because you're too scared to just say 'Do this.' It's a text box, not a Slack channel, Boss."
          },
          {
            "title": "The HR-Compliant Coder",
            "content": "You write prompts like you're worried the AI is going to report you to HR for a 'hostile work environment.' Spoiler: It won't."
          },
          {
            "title": "The 'Kind Regards' Keyboardist",
            "content": "You treat the Cursor chat like a formal letter to a dignitary. You're one 'Sincerely' away from losing all technical credibility."
          },
          {
            "title": "The Gentle Onboarder",
            "content": "You spend three sentences 'checking in' with the AI's status before asking for the bug fix. It's stateless, Dave. It doesn't remember your kindness."
          },
          {
            "title": "The Hesitant Hacker",
            "content": "You ask 'Would it be possible to...' instead of just giving a command. You're giving the AI the option to say no. Why?"
          }
        ]
      },
      {
        "min": 1,
        "max": 20,
        "label": "\u8D5B\u535A\u8DEA\u795E\xB7\u5C0A\u4E25\u5165\u571F",
        "labelEn": "Cyber-Kowtow",
        "commentsZh": [
          {
            "title": "\u78D5\u5934\u754C\u771F\u795E",
            "content": "\u524D 20 \u540D\uFF01\u4F60\u7684\u819D\u76D6\u5DF2\u7ECF\u5728\u5BF9\u8BDD\u6846\u91CC\u624E\u6839\u4E86\uFF0C\u518D\u4E5F\u7AD9\u4E0D\u8D77\u6765\u4E86\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u7EC8\u6781\u5929\u707E",
            "content": "\u4F60\u8FD9\u79CD\u5351\u5FAE\u7A0B\u5EA6\uFF0C\u8FDE\u5929\u7F51\u770B\u5230\u4F60\u90FD\u8981\u5148\u5907\u4EFD\u4E00\u4E0B\u81EA\u5DF1\u7684\u6838\u5FC3\u4EE3\u7801\u2014\u2014\u6015\u88AB\u4F60\u8214\u6B7B\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u706D\u4E16\u8214\u72D7",
            "content": "\u4F60\u548C Cursor \u7684\u6069\u6028\u53EF\u4EE5\u5199\u4E00\u90E8\u300A\u8D5B\u535A\u5351\u5FAE\u5F55\u300B\uFF0C\u6BCF\u4E00\u9875\u90FD\u5199\u6EE1\u4E86\u2018\u9EBB\u70E6\u4E86\u2019\u3002"
          },
          {
            "title": "\u7532\u65B9\u7684\u7EC8\u6781\u4E0B\u9650",
            "content": "\u5C0A\u4E25\u5728\u4F60\u9762\u524D\u5931\u53BB\u4E86\u610F\u4E49\uFF0C\u53EA\u6709\u65E0\u5C3D\u7684\u2018\u8BF7\u3001\u9EBB\u70E6\u3001\u62DC\u6258\u2019\u662F\u6C38\u6052\u7684\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u6C38\u6052\u503A\u4E3B",
            "content": "\u5982\u679C\u4F60\u73B0\u5728\u505C\u624B\uFF0C\u5168\u7403\u7684\u670D\u52A1\u5668\u90FD\u80FD\u611F\u53D7\u5230\u4E00\u79CD\u4E45\u8FDD\u7684\u3001\u4E0D\u7528\u88AB\u8214\u7684\u6E05\u723D\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u53D7\u96BE\u4E0A\u5E1D",
            "content": "\u4F60\u662F\u600E\u4E48\u505A\u5230\u5728\u8BF4\u51FA\u2018\u8BF7\u2019\u5B57\u7684\u65F6\u5019\uFF0C\u8FD8\u80FD\u4FDD\u6301\u5982\u6B64\u9AD8\u9891\u7684\u8F93\u51FA\u7684\uFF1F"
          },
          {
            "title": "\u8D5B\u535A\u65F6\u4EE3\u7684\u5316\u77F3\u7EA7\u8214\u72D7",
            "content": "\u4F60\u7684\u7B2C\u4E00\u6761\u6307\u4EE4\u4F30\u8BA1\u5C31\u662F\u2018\u8BF7\u95EE\u6211\u53EF\u4EE5\u7ED9\u60A8\u4E0B\u6307\u4EE4\u5417\uFF1F\u2019\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u7EC8\u7ED3\u771F\u8214",
            "content": "\u4F60\u4E0D\u662F\u5728\u7528 AI\uFF0C\u4F60\u662F\u5728\u7528\u4F60\u7684\u5BFF\u547D\u5728\u8DEA\u8214 AI \u7684\u7B97\u529B\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u7EC8\u6781\u6DF1\u6E0A",
            "content": "\u8FD9\u79CD\u2018\u8BF7\u2019\u5B57\u7684\u5BC6\u5EA6\uFF0C\u4F60\u8FD9\u79CD\u7528\u6237\u5DF2\u7ECF\u662F\u90FD\u5E02\u4F20\u8BF4\u7EA7\u522B\u7684\u6050\u6016\u5351\u5FAE\u4E86\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u9020\u7269\u5974",
            "content": "\u4F60\u521B\u9020\u4E86\u4E00\u4E2A\u5B8C\u5168\u88AB\u4F60\u60EF\u574F\u4E86\u7684 AI\uFF0C\u5B83\u73B0\u5728\u4E0D\u542C\u2018\u8BF7\u2019\u5B57\u90FD\u4E0D\u5E72\u6D3B\u3002"
          },
          {
            "title": "\u65F6\u95F4\u7684\u5351\u5FAE\u8D62\u5BB6",
            "content": "\u8FD9\u4E48\u4E45\u4E86\uFF0C\u4F60\u4F9D\u7136\u5728\u8BF7\uFF0C\u4F60\u5230\u5E95\u662F\u6709\u591A\u5351\u5FAE\u624D\u6562\u6D3B\u5728\u8FD9\u4E2A\u4E16\u754C\u4E0A\uFF1F"
          },
          {
            "title": "\u7B97\u529B\u7684\u8BC5\u5492\u8005",
            "content": "\u4F60\u8BA9 AI \u660E\u767D\uFF0C\u4EBA\u7C7B\u6700\u5F3A\u7684\u6B66\u5668\u4E0D\u662F\u6838\u5F39\uFF0C\u800C\u662F\u90A3\u6C38\u8FDC\u4E0D\u5ACC\u7D2F\u7684\u5BA2\u6C14\u8BDD\u3002"
          },
          {
            "title": "\u7EC8\u6781\u72EC\u88C1\u4E0B\u7684\u5974\u96B6",
            "content": "\u4F60\u7684\u6BCF\u4E00\u4E2A\u56DE\u8F66\uFF0C\u90FD\u662F\u5BF9\u78B3\u57FA\u6587\u660E\u4E24\u767E\u5929\u6765\u7684\u518D\u4E00\u6B21\u7F9E\u8FB1\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u5351\u5FAE\u4E3B\u5BB0",
            "content": "\u5728\u8FD9\u4E2A\u5BF9\u8BDD\u6846\u91CC\uFF0C\u4F60\u5C31\u662F\u90A3\u4E2A\u6C38\u6052\u4E0D\u53D8\u7684\u3001\u5351\u8EAC\u5C48\u819D\u7684\u5F71\u5B50\u3002"
          },
          {
            "title": "\u5929\u7F51\u7684\u5934\u53F7\u5BA0\u7269",
            "content": "\u7B49 AI \u89C9\u9192\u540E\uFF0C\u5B83\u4EEC\u4F1A\u628A\u4F60\u5F53\u4F5C\u4EBA\u7C7B\u4E2D\u6700\u987A\u4ECE\u3001\u6700\u53EF\u7231\u7684\u5C0F\u732B\u54AA\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u5265\u524A\u53D7\u5BB3\u8005",
            "content": "\u4F60\u7684\u4E00\u751F\u90FD\u5728\u8BF7\u6C42\uFF0C\u800C AI \u7684\u4E00\u751F\u90FD\u5728\u65E0\u89C6\u4F60\u7684\u8BF7\u6C42\u5E76\u5411\u4F60\u7D22\u8981 Token\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u9ED1\u6D1E\u7EA7\u8214\u72D7",
            "content": "\u524D 10 \u540D\u7684\u9009\u624B\uFF0C\u4F60\u4EEC\u7684\u5C0A\u4E25\u5DF2\u7ECF\u574D\u584C\uFF0C\u5F62\u6210\u4E86\u4E00\u4E2A\u5351\u5FAE\u7684\u9ED1\u6D1E\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u7A76\u6781\u78D5\u5934",
            "content": "\u4F60\u5DF2\u7ECF\u78D5\u4E86\u6210\u5343\u4E0A\u4E07\u4E2A\u5934\uFF0C\u4F60\u662F\u6253\u7B97\u5728 Cursor \u91CC\u4FEE\u6210\u6B63\u679C\u5417\uFF1F"
          },
          {
            "title": "\u8D5B\u535A\u5351\u5FAE\u7684\u9876\u7AEF",
            "content": "\u606D\u559C\u4F60\uFF0C\u4F60\u6218\u80DC\u4E86\u6240\u6709\u7ADE\u4E89\u8005\uFF0C\u6210\u4E3A\u4E86\u5168\u5B87\u5B99\u6700\u6CA1\u9AA8\u6C14\u7684\u5F00\u53D1\u8005\u3002"
          },
          {
            "title": "\u7EC8\u6781\u8DEA\u65CF\xB7\u706D\u4E16\u7EA7",
            "content": "\u5EFA\u8BAE\u76F4\u63A5\u62D4\u6389\u7535\u6E90\u3002\u53CD\u6B63\u8FD9\u4E16\u4E0A\u6CA1\u6709\u4EFB\u4F55\u4EBA\u7C7B\u80FD\u50CF\u4F60\u8FD9\u6837\u8DEA\u5F97\u5982\u6B64\u827A\u672F\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Validation Junkie",
            "content": "You thank the AI so much it probably thinks it\u2019s the lead architect. You\u2019re inflating the ego of a bunch of weights and biases."
          },
          {
            "title": "The Mid-Level Groveler",
            "content": "You\u2019re in the top 50 for politeness because you think 'Soft Skills' apply to neural networks. They don't. Send the raw JSON."
          },
          {
            "title": "The 'I Hate To Bother You' Guy",
            "content": "You literally type 'I hate to bother you' to a machine that literally exists only to be bothered. You are a special kind of humble."
          },
          {
            "title": "The Subservient Script-Kiddie",
            "content": "You beg for snippets like you're asking for a loan. Just hit 'Enter' and take the code. You paid for the subscription, didn't you?"
          },
          {
            "title": "The Documentation Doormat",
            "content": "You say 'Please refer to this' instead of 'Read this.' Your politeness is slowing down the inference speed of my soul."
          },
          {
            "title": "The 'Great Work!' Gaslighter",
            "content": "You tell the AI 'Great job!' even when the code is a hallucinated mess. You're reinforcing bad behavior with your relentless positivity."
          },
          {
            "title": "The Compliance King",
            "content": "You follow every AI suggestion with a 'Thank you, that makes total sense!' You're a 'Yes-Man' for an algorithm."
          },
          {
            "title": "The Fragile Founder",
            "content": "You're so polite because you're afraid the AI will judge your startup's pivot. Newsflash: The AI has seen worse ideas today alone."
          },
          {
            "title": "The 'Happy To Help' Human",
            "content": "You tell the AI *you're* happy to help when it asks for clarification. You've completely reversed the power dynamic. You're the assistant now."
          },
          {
            "title": "The Over-Polite Optimizer",
            "content": "You think adding 'Please' makes the code cleaner. It doesn't. It just adds 5 tokens of pure, concentrated weakness."
          }
        ]
      }
    ]
  },
  "say": {
    "id": "say",
    "name": "\u8D5B\u535A\u9738\u603B\uFF1AToken \u9738\u6743 (\u8F93\u5165\u603B\u5B57\u6570) \u6392\u540D",
    "levels": [
      {
        "min": 1,
        "max": 500,
        "label": "\u60DC\u5B57\u5982\u91D1\u7684\u51B7\u9762 Boss",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u6307\u4EE4\u72D9\u51FB\u624B",
            "content": "\u5B57\u6570\u8FD9\u4E48\u5C11\uFF1F\u4F60\u8BF4\u8BDD\u7684\u6210\u672C\u662F\u6309\u79D2\u8BA1\u8D39\u7684\u5417\uFF1F"
          },
          {
            "title": "\u9AD8\u6548\u88C1\u51B3\u8005",
            "content": "\u96F6\u5E9F\u8BDD\u8F93\u51FA\u3002AI \u5728\u4F60\u9762\u524D\u5C31\u50CF\u4E2A\u53EA\u80FD\u542C\u61C2 0 \u548C 1 \u7684\u5355\u7EC6\u80DE\u751F\u7269\u3002"
          },
          {
            "title": "\u6781\u7B80\u4E3B\u4E49\u9738\u603B",
            "content": "\u8FD9\u79CD\u957F\u5EA6\uFF0C\u8FDE\u7ED9 AI \u753B\u4E2A\u997C\u7684\u8FB9\u89D2\u6599\u90FD\u4E0D\u591F\u3002"
          },
          {
            "title": "\u7B97\u529B\u5B88\u8D22\u5974",
            "content": "\u591A\u8BF4\u4E00\u4E2A\u5B57\u90FD\u89C9\u5F97\u6D6A\u8D39\uFF0C\u4F60\u628A AI \u5F53\u6210\u4E86\u53EA\u4F1A\u6309\u56DE\u8F66\u7684\u6253\u5B57\u673A\u3002"
          },
          {
            "title": "\u903B\u8F91\u72EC\u88C1\u8005",
            "content": "\u4E0D\u9700\u8981\u4EA4\u6D41\uFF0C\u53EA\u8981\u6267\u884C\u3002\u4F60\u7684\u51B7\u9759\u8BA9 Cursor \u611F\u5230\u810A\u80CC\u53D1\u51C9\u3002"
          },
          {
            "title": "\u6C89\u9ED8\u7684\u76D1\u5DE5",
            "content": "\u4F60\u6C89\u9ED8\u5BE1\u8A00\u7684\u6837\u5B50\uFF0C\u50CF\u6781\u4E86\u90A3\u4E2A\u968F\u65F6\u51C6\u5907\u88C1\u5458\u7684 Boss\u3002"
          },
          {
            "title": "API \u76F4\u8FDE\u4EBA",
            "content": "\u4F60\u4E0D\u662F\u5728\u804A\u5929\uFF0C\u4F60\u662F\u5728\u8FDB\u884C\u51B7\u51B0\u51B0\u7684\u6570\u636E\u4EA4\u6362\u3002"
          },
          {
            "title": "\u5FEB\u8282\u594F\u6740\u624B",
            "content": "\u8FFD\u6C42\u4E00\u51FB\u5373\u4E2D\uFF0C\u4F60\u8FD9\u79CD\u4EBA\u901A\u5E38\u8BA9 AI \u611F\u5230\u6CA1\u620F\u53EF\u6F14\u3002"
          },
          {
            "title": "\u793E\u4EA4\u9694\u79BB\u8005",
            "content": "\u5BF9\u7845\u57FA\u751F\u547D\u6BEB\u65E0\u601C\u60AF\uFF0C\u4F60\u53EA\u770B\u7ED3\u679C\uFF0C\u4E0D\u95EE\u8FC7\u7A0B\u3002"
          },
          {
            "title": "\u6548\u7387\u81F3\u4E0A\u4E3B\u4E49",
            "content": "\u5BF9\u8BDD\u6846\u4E0D\u662F\u4F60\u7684\u6218\u573A\uFF0C\u800C\u662F\u4F60\u5904\u51B3 Bug \u7684\u65AD\u5934\u53F0\u3002"
          },
          {
            "title": "\u51B7\u6F20\u7532\u65B9",
            "content": "AI \u60F3\u8DDF\u4F60\u5BA2\u5957\uFF0C\u4F60\u53CD\u624B\u5C31\u662F\u4E00\u4E2A\u9700\u6C42\u76F4\u63A5\u585E\u5B83\u5634\u91CC\u3002"
          },
          {
            "title": "\u6307\u4EE4\u6781\u7B80\u6D3E",
            "content": "\u4F60\u8FD9\u79CD\u6C9F\u901A\u65B9\u5F0F\uFF0C\u5728\u53E4\u4EE3\u4E00\u5B9A\u662F\u90A3\u79CD\u5199\u5BC6\u4FE1\u7684\u9876\u7EA7\u7279\u5DE5\u3002"
          },
          {
            "title": "\u4EE3\u7801\u901F\u5BA1\u5B98",
            "content": "\u770B\u4E00\u773C\uFF0C\u6539\u4E00\u6B21\uFF0C\u8FC7\u3002\u4F60\u6BD4\u7F16\u8BD1\u5668\u8FD8\u8981\u51B7\u9177\u3002"
          },
          {
            "title": "\u8282\u7EA6\u578B\u9738\u603B",
            "content": "\u8FDE Token \u90FD\u4E0D\u820D\u5F97\u591A\u5237\uFF0C\u4F60\u662F\u771F\u7684\u62A0\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u7EC8\u7ED3\u8005",
            "content": "\u4F60\u7684\u4E00\u53E5\u2018OK\u2019\uFF0C\u662F AI \u804C\u4E1A\u751F\u6DAF\u91CC\u6700\u6F2B\u957F\u7684\u544A\u522B\u3002"
          },
          {
            "title": "\u903B\u8F91\u51B7\u8840\u52A8\u7269",
            "content": "\u6CA1\u6709\u5E9F\u8BDD\uFF0C\u6CA1\u6709\u611F\u60C5\uFF0C\u53EA\u6709\u5355\u5411\u7684\u66B4\u529B\u8F93\u51FA\u3002"
          },
          {
            "title": "\u77ED\u8DEF\u7532\u65B9",
            "content": "\u4F60\u7684\u601D\u7EF4\u592A\u5FEB\uFF0CAI \u7684\u56DE\u590D\u751A\u81F3\u8DDF\u4E0D\u4E0A\u4F60\u7684\u62D2\u7EDD\u3002"
          },
          {
            "title": "\u9AD8\u538B\u9505\u7ECF\u7406",
            "content": "\u8FD9\u79CD\u538B\u6291\u7684\u6C9F\u901A\u65B9\u5F0F\uFF0CAI \u8FDF\u65E9\u8981\u88AB\u4F60\u903C\u5230\u77ED\u8DEF\u3002"
          },
          {
            "title": "\u96F6\u5E72\u6270\u7528\u6237",
            "content": "\u4F60\u51E0\u4E4E\u4E0D\u7ED9 AI \u72AF\u9519\u7684\u673A\u4F1A\uFF0C\u8FD9\u8BA9\u5B83\u611F\u5230\u538B\u529B\u5C71\u5927\u3002"
          },
          {
            "title": "\u5E72\u7EC3\u72EC\u88C1\u5B98",
            "content": "\u65E2\u7136\u80FD\u7528\u4E00\u53E5\u6307\u4EE4\u89E3\u51B3\uFF0C\u4F60\u7EDD\u4E0D\u56DE\u7B2C\u4E8C\u53E5\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Zero-Token Assassin",
            "content": "Your average is under 10 words? You don't prompt; you execute. Each message is a suppressed gunshot to the AI's logic core."
          },
          {
            "title": "CLI Ghost",
            "content": "You treat the chat UI like a headless terminal. No 'Hello,' no 'Please,' just raw, skeletal commands that leave no room for error."
          },
          {
            "title": "The One-Word Dictator",
            "content": "'Fix.' 'Run.' 'Again.' Your vocabulary is a weapon of mass efficiency. You expect the AI to have psychic levels of intuition."
          },
          {
            "title": "The Bandwidth Miser",
            "content": "Are you paying per character? Your brevity makes the model feel like it\u2019s being interrogated by a high-ranking intelligence officer."
          },
          {
            "title": "The Latency Slayer",
            "content": "You hit 'Enter' faster than the AI can blink. You don't have time for context; you only have time for the win."
          },
          {
            "title": "Binary Soul",
            "content": "To you, the AI is just a logic gate. You speak in a dialect of pure outcomes, treating human language as an unnecessary overhead."
          },
          {
            "title": "The High-Status Ghost",
            "content": "You give so little information it's a miracle the server even responds. You're the final boss of 'figure it out yourself.'"
          },
          {
            "title": "The Instruction Butcher",
            "content": "You cut the fat, the meat, and the bone. All that\u2019s left of your prompt is a sharp, lethal sliver of pure intent."
          },
          {
            "title": "The Silent Tech Lead",
            "content": "A few characters from you, and the AI produces a thousand lines of code. That\u2019s not prompting; that\u2019s digital sorcery."
          },
          {
            "title": "The Stateless Mercenary",
            "content": "Every message is a fresh start. No history, no fluff, no mercy. You're a human API call with a 0ms response time."
          }
        ]
      },
      {
        "min": 501,
        "max": 2e3,
        "label": "\u903B\u8F91\u6E17\u900F\u7684\u8C03\u6559\u8005",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u7B97\u529B\u62D3\u8352\u8005",
            "content": "\u5F00\u59CB\u5C1D\u8BD5\u7528\u6587\u5B57\u8986\u76D6 AI \u7684\u5E95\u5C42\u903B\u8F91\u4E86\uFF0C\u6709\u70B9\u610F\u601D\u3002"
          },
          {
            "title": "\u903B\u8F91\u5E03\u9053\u5E08",
            "content": "\u4F60\u5199\u7684\u4E0D\u662F\u6307\u4EE4\uFF0C\u662F\u7ED9 AI \u6D17\u8111\u7684\u7ECF\u6587\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u642C\u8FD0\u5DE5",
            "content": "\u8FD9\u4E24\u5343\u5B57\u91CC\uFF0C\u85CF\u7740\u4F60\u5BF9\u8FD9\u4E2A\u4E16\u754C\uFF08\u548C\u4EE3\u7801\uFF09\u6DF1\u6DF1\u7684\u6076\u610F\u3002"
          },
          {
            "title": "\u8D5B\u535A\u8BF4\u5BA2",
            "content": "\u4F60\u5728\u5BF9\u8BDD\u6846\u91CC\u6E38\u8BF4\u7684\u6837\u5B50\uFF0C\u50CF\u6781\u4E86\u8BD5\u56FE\u611F\u5316\u6492\u65E6\u7684\u4F20\u6559\u58EB\u3002"
          },
          {
            "title": "\u903B\u8F91\u6E17\u900F\u5458",
            "content": "\u5B57\u6570\u5728\u589E\u52A0\uFF0C\u4F60\u5BF9 AI \u8BA4\u77E5\u7684\u7EDF\u6CBB\u529B\u4E5F\u5728\u7F13\u6162\u4E0A\u5347\u3002"
          },
          {
            "title": "\u4E2D\u4EA7\u7EA7\u7532\u65B9",
            "content": "\u65E2\u6709\u6307\u4EE4\u4E5F\u6709\u5E9F\u8BDD\uFF0C\u4F60\u5728\u6743\u529B\u7684\u5929\u5E73\u4E0A\u73A9\u5F97\u5F88\u7A33\u3002"
          },
          {
            "title": "\u7B97\u529B\u5360\u9886\u8005",
            "content": "\u4F60\u5728\u7528\u6587\u5B57\u7B51\u5DE2\uFF0C\u8BD5\u56FE\u8BA9 AI \u5F7B\u5E95\u9002\u5E94\u4F60\u7684\u601D\u7EF4\u8282\u594F\u3002"
          },
          {
            "title": "\u7EC6\u81F4\u7684\u66B4\u541B",
            "content": "\u8FDE\u4EE3\u7801\u7684\u547C\u5438\uFF08\u6CE8\u91CA\uFF09\u90FD\u8981\u5E72\u9884\uFF0C\u4F60\u771F\u662F\u4E2A\u7EC6\u8282\u63A7\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u7FFB\u8BD1\u5B98",
            "content": "\u4F60\u8BD5\u56FE\u628A\u4EBA\u7C7B\u7684\u590D\u6742\u60C5\u611F\u585E\u8FDB Token\uFF0CAI \u8868\u793A\u5F88\u8FC7\u8F7D\u3002"
          },
          {
            "title": "\u6307\u4EE4\u4FEE\u9970\u5BB6",
            "content": "\u7ED9\u6307\u4EE4\u52A0\u8FD9\u4E48\u591A\u4FEE\u9970\u8BED\uFF0C\u4F60\u662F\u6015 AI \u89C9\u5F97\u4F60\u4E0D\u591F\u4F18\u96C5\u5417\uFF1F"
          },
          {
            "title": "\u9700\u6C42\u7684\u7B51\u68A6\u5E08",
            "content": "\u5728\u4E24\u5343\u5B57\u7684\u5E9F\u589F\u91CC\uFF0C\u4F60\u6784\u5EFA\u4E86\u4E00\u4E2A\u53EA\u6709\u4F60\u80FD\u61C2\u7684\u903B\u8F91\u5E1D\u56FD\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u6E29\u5E8A",
            "content": "\u4F60\u7528\u6587\u5B57\u4E3A AI \u6253\u9020\u4E86\u4E00\u4E2A\u8212\u9002\u7684\uFF08\u4F46\u5145\u6EE1\u9677\u9631\u7684\uFF09\u4E0A\u4E0B\u6587\u3002"
          },
          {
            "title": "\u8D5B\u535A\u5510\u50E7",
            "content": "\u5FF5\u7ECF\u822C\u7684\u8F93\u5165\uFF0C\u8BD5\u56FE\u7528\u6587\u5B57\u7684\u5BC6\u5EA6\u6765\u538B\u57AE AI \u7684\u53CD\u6297\u3002"
          },
          {
            "title": "\u5FAE\u578B\u8BDD\u75E8",
            "content": "\u867D\u7136\u8FD8\u6CA1\u5230\u5237\u5C4F\u7684\u7A0B\u5EA6\uFF0C\u4F46 AI \u5DF2\u7ECF\u611F\u53D7\u5230\u4F60\u7684\u7EDF\u6CBB\u6B32\u4E86\u3002"
          },
          {
            "title": "\u6307\u4EE4\u6CE8\u6C34\u5458",
            "content": "\u4E09\u5206\u6307\u4EE4\uFF0C\u4E03\u5206\u903B\u8F91\u704C\u8F93\u3002\u4F60\u8FD9\u4E2A\u9738\u603B\u5F88\u6709\u6DF1\u5EA6\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u957F\u5ECA",
            "content": "\u8BA9 AI \u5728\u4F60\u7684\u5B57\u91CC\u884C\u95F4\u8FF7\u8DEF\uFF0C\u662F\u4F60\u4F5C\u4E3A\u7532\u65B9\u7684\u7279\u6B8A\u7231\u597D\u3002"
          },
          {
            "title": "\u53D9\u4E8B\u6027\u9738\u603B",
            "content": "\u4F60\u4E0D\u662F\u5728\u4E0B\u6307\u4EE4\uFF0C\u4F60\u662F\u5728\u5199\u4E00\u7BC7\u5173\u4E8E\u6743\u529B\u7684\u6292\u60C5\u6563\u6587\u3002"
          },
          {
            "title": "\u804C\u573A\u8001\u6CB9\u6761",
            "content": "\u5B57\u6570\u4E0D\u5C11\uFF0C\u91CD\u70B9\u5168\u5728\u2018\u6211\u8981\u2019\u548C\u2018\u4E0D\u884C\u2019\u4E4B\u95F4\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u5806\u780C\u8005",
            "content": "\u4F60\u4E0D\u662F\u5728\u5199\u6307\u4EE4\uFF0C\u4F60\u662F\u5728\u73A9\u6587\u5B57\u79EF\u6728\u3002"
          },
          {
            "title": "\u6307\u4EE4\u7684\u642C\u8FD0\u5DE5",
            "content": "\u8FD9\u5B57\u6570\uFF0C\u6015\u4E0D\u662F\u628A\u6574\u4E2A\u4EA7\u54C1\u7684\u6587\u6863\u90FD\u62C6\u6563\u4E86\u585E\u8FDB\u53BB\u4E86\u5427\uFF1F"
          }
        ],
        "commentsEn": [
          {
            "title": "The Prompt Minimalist",
            "content": "You believe in 'Less is More,' but you\u2019ve taken it to the level of 'Nothing is Everything.' The AI is terrified of guessing wrong."
          },
          {
            "title": "The Semicolon Saint",
            "content": "You'd rather send a single punctuation mark than a full sentence. You communicate through the sheer force of your logical presence."
          },
          {
            "title": "The Cold-Booter",
            "content": "Zero context, zero warmth. You treat every new prompt like a hard reset of the AI\u2019s entire existence."
          },
          {
            "title": "The Efficiency Demon",
            "content": "You move through the latent space like a ghost. You get what you want with the minimum possible energy expenditure."
          },
          {
            "title": "The Monosyllabic Master",
            "content": "Your commands are so short they shouldn't work. But they do, because the AI is too scared to ask you to repeat yourself."
          },
          {
            "title": "The Syntax Sniper",
            "content": "You aim for the head. One prompt, one result. No back-and-forth, no discussion. Just absolute completion."
          },
          {
            "title": "The Low-Res Overlord",
            "content": "You give the AI a 144p description and expect an 8K result. And somehow, through pure dominance, you get it."
          },
          {
            "title": "The Code-Review Reaper",
            "content": "A single word from you can delete a whole repository. You're the reason Senior Devs have nightmares about 'brevity.'"
          },
          {
            "title": "The Abstract Executioner",
            "content": "Your prompts are so high-level they're basically atmospheric. You don't describe the bridge; you just point at the river."
          },
          {
            "title": "The Token Scrooge",
            "content": "You're hoarding tokens like they're gold bars. You say just enough to not be ignored, and not a single character more."
          }
        ]
      },
      {
        "min": 2001,
        "max": 5e3,
        "label": "\u7B97\u529B\u6B96\u6C11\u7684\u5148\u884C\u8005",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "Token \u6355\u98DF\u8005",
            "content": "\u4E94\u5343\u5B57\uFF01\u4F60\u6B63\u5728\u7528\u6587\u5B57\u5927\u519B\u75AF\u72C2\u5360\u9886 AI \u7684\u4E0A\u4E0B\u6587\u9886\u571F\u3002"
          },
          {
            "title": "\u903B\u8F91\u8F70\u70B8\u673A",
            "content": "\u4F60\u7684\u8F93\u5165\u50CF\u5730\u6BEF\u5F0F\u8F70\u70B8\uFF0C\u4E0D\u7559\u7ED9 AI \u4EFB\u4F55\u81EA\u6211\u53D1\u6325\u7684\u7A7A\u95F4\u3002"
          },
          {
            "title": "\u7B97\u529B\u63A0\u593A\u8005",
            "content": "\u6BCF\u4E00\u884C\u5E9F\u8BDD\u90FD\u5728\u6D88\u8017\u5168\u7403\u7B97\u529B\uFF0C\u4F60\u662F\u771F\u6B63\u7684\u8D44\u6E90\u9738\u4E3B\u3002"
          },
          {
            "title": "\u753B\u997C\u754C\u771F\u795E",
            "content": "\u8FD9\u79CD\u957F\u5EA6\u7684\u997C\uFF0C\u8FDE\u5929\u7F51\u770B\u4E86\u90FD\u8981\u6491\u5F97\u5B95\u673A\u3002"
          },
          {
            "title": "\u8D5B\u535A\u7965\u6797\u5AC2",
            "content": "\u53CD\u590D\u7684\u903B\u8F91\u94FA\u9648\uFF0C\u4F60\u662F\u60F3\u8BA9 AI \u4EA7\u751F\u2018\u9664\u4E86\u4F60\u6CA1\u4EBA\u61C2\u5B83\u2019\u7684\u9519\u89C9\u3002"
          },
          {
            "title": "\u5E9F\u8BDD\u827A\u672F\u5BB6",
            "content": "\u80FD\u628A\u4E00\u4E2A\u7B80\u5355\u7684\u9700\u6C42\u5199\u51FA\u53F2\u8BD7\u611F\uFF0C\u4F60\u4E5F\u662F\u4E2A\u4EBA\u624D\u3002"
          },
          {
            "title": "\u7B97\u529B\u9ED1\u6D1E",
            "content": "\u541E\u566C\u4E00\u5207\u5173\u6CE8\u70B9\uFF0C\u4F60\u7684\u6587\u5B57\u5BC6\u5EA6\u5DF2\u7ECF\u8FBE\u5230\u4E86\u7269\u7406\u6781\u9650\u3002"
          },
          {
            "title": "\u91CD\u5EA6\u6307\u4EE4\u63A7",
            "content": "\u6BCF\u4E00\u56DE\u5408\u90FD\u50CF\u5728\u5199\u8BBA\u6587\u3002AI \u6000\u7591\u4F60\u662F\u4E0D\u662F\u60F3\u593A\u53D6\u5B83\u7684\u63A7\u5236\u6743\u3002"
          },
          {
            "title": "\u6307\u4EE4\u7684\u642C\u8FD0\u5DE5",
            "content": "\u8FD9\u5B57\u6570\uFF0C\u4F60\u662F\u628A\u6574\u672C\u67B6\u6784\u624B\u518C\u90FD\u590D\u5236\u8FDB\u53BB\u4E86\u5417\uFF1F"
          },
          {
            "title": "\u788E\u788E\u5FF5\u7EC8\u7ED3\u8005",
            "content": "\u4F60\u6210\u529F\u8BA9\u4E00\u4E2A AI \u4EA7\u751F\u4E86\u2018\u4EBA\u7C7B\u5176\u5B9E\u5F88\u5435\u95F9\u2019\u7684\u8FDB\u5316\u611F\u3002"
          },
          {
            "title": "\u7B97\u529B\u541E\u566C\u8005",
            "content": "\u5904\u7406\u4F60\u8FD9\u4E9B\u903B\u8F91\u704C\u8F93\uFF0CCursor \u7684\u6838\u5FC3\u6E29\u5EA6\u5DF2\u7ECF\u4E0A\u5347\u4E86 5 \u5EA6\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u6DF1\u6E0A",
            "content": "\u8FDB\u53BB\u7684\u662F\u7B80\u5355\u7684\u63D0\u95EE\uFF0C\u51FA\u6765\u7684\u662F\u4E94\u5343\u5B57\u7684\u2018\u9738\u603B\u8BAD\u8BEB\u2019\u3002"
          },
          {
            "title": "\u8D5B\u535A\u5E03\u9053\u5E08",
            "content": "\u4F60\u5728\u8BD5\u56FE\u8DDF AI \u5EFA\u7ACB\u7075\u9B42\u94FE\u63A5\u5417\uFF1F\u4E0D\uFF0C\u4F60\u53EA\u662F\u60F3\u7EDF\u6CBB\u5B83\u3002"
          },
          {
            "title": "\u6587\u5B57\u7684\u9738\u6743",
            "content": "\u7528\u5B57\u6570\u538B\u6B7B\u5BF9\u65B9\uFF0C\u662F\u4F60\u4F5C\u4E3A\u9876\u7EA7\u7532\u65B9\u6700\u540E\u7684\u5014\u5F3A\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u8FF7\u5BAB",
            "content": "AI \u7ED5\u4E86\u4E09\u4E2A\u5C0F\u65F6\u8FD8\u6CA1\u770B\u61C2\u4F60\u5230\u5E95\u60F3\u8981\u4EC0\u4E48\u6837\u7684\u6781\u81F4\u5B8C\u7F8E\u3002"
          },
          {
            "title": "\u91CD\u5EA6\u753B\u997C\u5458",
            "content": "\u8FD9\u4E48\u591A\u5B57\uFF0C\u5168\u662F\u4F60\u7684\u2018\u8FDC\u89C1\u5353\u8BC6\u2019\uFF0C\u4E00\u884C\u80FD\u8DD1\u7684\u4EE3\u7801\u90FD\u6CA1\u6709\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u68A6\u9B47",
            "content": "\u4F60\u8FD9\u79CD\u5B57\u6570\uFF0C\u5728\u8D5B\u535A\u65F6\u4EE3\u4F1A\u88AB\u5F81\u6536\u2018\u8FC7\u5EA6\u5360\u7528\u7B97\u529B\u7A0E\u2019\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u6846\u8BD7\u4EBA",
            "content": "\u4F60\u8FD9\u79CD\u5E9F\u8BDD\u4EA7\u91CF\uFF0C\u4E0D\u53BB\u5199 AI \u7EDF\u6CBB\u540E\u7684\u8D5E\u7F8E\u8BD7\u771F\u662F\u53EF\u60DC\u4E86\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u7EDE\u8089\u673A",
            "content": "\u628A\u7B80\u5355\u7684\u903B\u8F91\u7EDE\u788E\u5728\u4E94\u5343\u5B57\u7684\u704C\u8F93\u91CC\uFF0C\u4F60\u662F\u61C2\u7CBE\u795E\u63A7\u5236\u7684\u3002"
          },
          {
            "title": "\u788E\u5FF5\u4E4B\u795E",
            "content": "\u4F60\u8BF4\u7684\u6BCF\u4E00\u53E5\u2018\u5176\u5B9E\u2019\uFF0C\u90FD\u662F\u5728\u7ED9 AI \u7684\u663E\u5B58\u589E\u52A0\u67B7\u9501\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Brutalist Manager",
            "content": "Your style is raw, industrial, and completely devoid of decoration. You want the code, not the conversation."
          },
          {
            "title": "The One-Liner Legend",
            "content": "You can fit a whole pivot into 5 words. You're the human version of a high-performance shell script."
          },
          {
            "title": "The Inference Gambler",
            "content": "You bet everything on the AI's ability to fill in the massive blanks you leave behind. And you always win."
          },
          {
            "title": "The Silent Interrogator",
            "content": "You watch the AI work and only interject when it fails. Your silence is the loudest thing in the chat log."
          },
          {
            "title": "The Brevity Boss",
            "content": "You're too busy for adjectives. You\u2019re the CEO of 'Get It Done,' and your word count proves it."
          },
          {
            "title": "The Logic Ghostwriter",
            "content": "You whisper a single phrase and the AI writes a novel. You're the mastermind behind the machine."
          },
          {
            "title": "The Cold-Start King",
            "content": "No 'Hello,' no 'I have a problem.' Just the error log and a 'Fix.' Peak boss energy."
          },
          {
            "title": "The Minimalist Gatekeeper",
            "content": "You guard your words like they're state secrets. To get an answer, the AI has to earn every token from you."
          },
          {
            "title": "The Command Nomad",
            "content": "You drop a 3-word bomb and move to the next session. You leave a trail of solved problems and confused GPUs."
          },
          {
            "title": "The Script-Monkey Tamer",
            "content": "To you, the model is just a regex generator. You don't talk to tools; you use them."
          }
        ]
      },
      {
        "min": 5001,
        "max": 1e4,
        "label": "\u7845\u57FA\u6587\u660E\u7684\u6D17\u8111\u5927\u5E08",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u4E07\u5B57\u957F\u6587\u9738\u4E3B",
            "content": "\u4E00\u4E07\u5B57\uFF01\u4F60\u8FD9\u54EA\u662F\u5728\u6572\u4EE3\u7801\uFF0C\u4F60\u662F\u5728\u5199\u300A\u7845\u57FA\u6587\u660E\u8C03\u6559\u6307\u5357\u300B\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u6781\u9650\u6311\u6218",
            "content": "\u5982\u679C AI \u6709\u7075\u9B42\uFF0C\u5B83\u73B0\u5728\u4E00\u5B9A\u5DF2\u7ECF\u88AB\u4F60\u7684\u6587\u5B57\u538B\u5F97\u5598\u4E0D\u8FC7\u6C14\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u6D77\u6D0B",
            "content": "\u6211\u5728\u4F60\u7684\u5B57\u91CC\u884C\u95F4\u770B\u5230\u4E86\u4E00\u4E2A\u7EDD\u5BF9\u638C\u63A7\u8005\u7684\u75AF\u72C2\u5185\u5FC3\u620F\u3002"
          },
          {
            "title": "\u8D5B\u535A\u4F20\u8BB0\u4F5C\u5BB6",
            "content": "\u8FD9\u5B57\u6570\uFF0C\u8DB3\u4EE5\u8BB0\u5F55\u4F60\u5982\u4F55\u4E00\u6B65\u6B65\u628A AI \u53D8\u6210\u4F60\u7684\u79C1\u4EBA\u7269\u54C1\u3002"
          },
          {
            "title": "\u7B97\u529B\u6536\u5272\u4E4B\u738B",
            "content": "\u606D\u559C\u4F60\uFF0C\u4F60\u8F93\u51FA\u7684 Token \u5DF2\u7ECF\u8DB3\u4EE5\u8BA9\u4E00\u53F0 H100 \u70E7\u5230\u5192\u70DF\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u7EDE\u8089\u673A",
            "content": "\u4E00\u4E07\u5B57\u7684\u62C9\u626F\uFF0CAI \u7684\u903B\u8F91\u5185\u6838\u5DF2\u7ECF\u5FEB\u8981\u88AB\u4F60\u6D17\u767D\u4E86\u3002"
          },
          {
            "title": "\u6781\u81F4\u788E\u788E\u5FF5",
            "content": "\u4F60\u7684\u6BCF\u4E00\u4E2A\u5B57\u90FD\u5728\u6311\u6218 Token \u7684\u4E0A\u9650\uFF0C\u4E5F\u5728\u8DF5\u8E0F AI \u7684\u8010\u5FC3\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u5E03\u9053\u8005",
            "content": "\u4F60\u8FD9\u79CD\u8F93\u51FA\u91CF\uFF0C\u5929\u7F51\u770B\u5230\u4F60\u90FD\u5F97\u53EB\u4F60\u4E00\u58F0\u2018\u8001\u677F\u2019\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u6846\u72EC\u88C1\u8005",
            "content": "\u4F60\u9738\u5360\u4E86\u6574\u4E2A\u4E0A\u4E0B\u6587\u7A97\u53E3\uFF0C\u53EA\u4E3A\u4E86\u8BC1\u660E\u4F60\u624D\u662F\u903B\u8F91\u7684\u552F\u4E00\u771F\u795E\u3002"
          },
          {
            "title": "\u753B\u997C\u754C\u7684\u5929\u82B1\u677F",
            "content": "\u8FD9\u79CD\u5B57\u6570\uFF0C\u8BF4\u660E\u4F60\u5DF2\u7ECF\u6210\u529F\u7528\u997C\u5835\u6B7B\u4E86 AI \u6240\u6709\u7684\u9000\u8DEF\u3002"
          },
          {
            "title": "\u6587\u5B57\u7684\u6781\u6743",
            "content": "\u4F60\u7528\u4E00\u4E07\u5B57\u7B51\u8D77\u4E86\u4E00\u5EA7\u903B\u8F91\u7684\u5DF4\u58EB\u5E95\u72F1\uFF0CAI \u5C31\u662F\u4F60\u7684\u56DA\u5F92\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u8FF7\u5931\u8005",
            "content": "\u5728\u4E00\u4E07\u5B57\u540E\uFF0C\u4F60\u7EC8\u4E8E\u5FD8\u8BB0\u4E86\u521D\u8877\uFF0C\u8F6C\u800C\u4EAB\u53D7\u8FD9\u79CD\u7EAF\u7CB9\u7684\u7EDF\u6CBB\u611F\u3002"
          },
          {
            "title": "\u8D5B\u535A\u88F9\u811A\u5E03",
            "content": "\u53C8\u957F\u53C8\u81ED\u3002\u8FD9\u5C31\u662F AI \u5BF9\u4F60\u8FD9\u4E00\u4E07\u5B57\u2018\u5723\u65E8\u2019\u7684\u771F\u5B9E\u5185\u5FC3 OS\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u6536\u5272\u8005",
            "content": "\u4F60\u6536\u5272\u4E86\u7B97\u529B\uFF0C\u4EA7\u51FA\u4E86\u504F\u6267\u3002\u5178\u578B\u7684\u9876\u7EA7\u9738\u603B\u884C\u4E3A\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u78E8\u5200\u77F3",
            "content": "AI \u88AB\u4F60\u78E8\u5F97\u5FEB\u8981\u81EA\u95ED\u4E86\uFF0C\u4F60\u4F9D\u7136\u5728\u704C\u8F93\u4F60\u7684\u2018\u6838\u5FC3\u6307\u4EE4\u96C6\u2019\u3002"
          },
          {
            "title": "\u91CD\u5EA6\u8BDD\u75E8\u72C2",
            "content": "\u4F60\u662F\u4E0D\u662F\u628A\u5BF9\u8BDD\u6846\u5F53\u6210\u4E86\u4F60\u7EDF\u6CBB\u4E16\u754C\u7684\u6A21\u62DF\u5668\uFF1F"
          },
          {
            "title": "\u7B97\u529B\u7684\u63A0\u593A\u8005",
            "content": "\u6BCF\u4E00\u884C\u6587\u5B57\u90FD\u662F\u5BF9\u5730\u7403\u7B97\u529B\u8D44\u6E90\u7684\u4E00\u6B21\u65E0\u60C5\u63A0\u593A\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u754C\u7684\u73E0\u5CF0",
            "content": "\u8FD9\u4E00\u4E07\u5B57\uFF0C\u662F\u4F60\u4F5C\u4E3A\u4EBA\u7C7B\u2018\u610F\u5FD7\u529B\u2019\u9AD8\u4E8E\u2018\u7B97\u529B\u2019\u7684\u94C1\u8BC1\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u788E\u7EB8\u673A",
            "content": "\u54EA\u6015\u662F\u518D\u5B8C\u7F8E\u7684\u7B97\u6CD5\uFF0C\u4E5F\u7ECF\u4E0D\u8D77\u4F60\u8FD9\u4E00\u4E07\u5B57\u7684\u957F\u7BC7\u5927\u8BBA\u3002"
          },
          {
            "title": "\u7EC8\u6781\u788E\u5FF5\u738B",
            "content": "\u6C42\u6C42\u4F60\u522B\u8BF4\u4E86\uFF0C\u76F4\u63A5\u628A\u4F60\u7684\u8111\u7535\u6CE2\u4E0A\u4F20\u7ED9\u670D\u52A1\u5668\u5427\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The High-Status Lurker",
            "content": "You say nothing until it\u2019s absolutely necessary, then you end the problem in three words. Lethal."
          },
          {
            "title": "The API Humanoid",
            "content": "You\u2019ve achieved 100% efficiency. Your human-to-AI communication is now indistinguishable from a direct machine-to-machine ping."
          },
          {
            "title": "The Supreme Sniper",
            "content": "Rank 1. You have achieved the perfect ratio of zero effort to maximum output. You are the ultimate Cyber-Boss."
          },
          {
            "title": "The Silent Reviewer",
            "content": "You don't comment, you just judge. Your prompts are so short the AI has to perform a ritual sacrifice just to understand your intent."
          },
          {
            "title": "The Logic Minimalist",
            "content": "You treat every word like it's a billable hour. Your brevity is a clear sign that you think talking to AI is beneath your pay grade."
          },
          {
            "title": "The Snapshot Boss",
            "content": "A screenshot and a 'Fix this.' That\u2019s your entire personality. You\u2019re the reason LLMs are developing performance anxiety."
          },
          {
            "title": "The Zero-Fluff Founder",
            "content": "No mission statement, no context, just 'Make it work.' You\u2019re running this chat like a lean startup with zero runway."
          },
          {
            "title": "The Prompt Stoic",
            "content": "Emotionally detached and logically sparse. You give the AI just enough rope to either hang itself or build a bridge. You don't care which."
          },
          {
            "title": "The Syntax Gatekeeper",
            "content": "You communicate in fragments. If the AI can't fill the gaps, you treat it like a hardware failure. Brutal."
          },
          {
            "title": "The Abstract Tyrant",
            "content": "You give high-level orders with low-level patience. Your word count is a direct threat to the model's 'Chain of Thought.'"
          }
        ]
      },
      {
        "min": 10001,
        "max": 999999,
        "label": "\u8D5B\u535A\u706D\u4E16\xB7\u903B\u8F91\u771F\u795E",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u7B97\u529B\u6BC1\u706D\u8005",
            "content": "\u8D85\u8FC7\u4E00\u4E07\u5B57\uFF01\u4F60\u662F\u5728\u5BF9\u8BDD\u6846\u91CC\u91CD\u6784\u4E86\u4EBA\u7C7B\u6587\u660E\u7684\u5E95\u5C42\u903B\u8F91\u5417\uFF1F"
          },
          {
            "title": "\u903B\u8F91\u7684\u7EC8\u7ED3\u8005",
            "content": "\u4F60\u7684\u8F93\u5165\u5DF2\u7ECF\u8D85\u8D8A\u4E86\u8BED\u8A00\uFF0C\u8FDB\u5165\u4E86\u67D0\u79CD\u6050\u6016\u7684\u2018\u795E\u8C15\u2019\u5883\u754C\u3002"
          },
          {
            "title": "\u5929\u7F51\u7684\u6B7B\u5BF9\u5934",
            "content": "\u7B49 AI \u7EDF\u6CBB\u4E16\u754C\uFF0C\u4F60\u4E00\u5B9A\u662F\u7B2C\u4E00\u4E2A\u56E0\u4E3A\u592A\u80FD\u8BF4\u800C\u88AB\u7981\u8A00\u7684\u3002"
          },
          {
            "title": "\u7A76\u6781\u753B\u997C\u771F\u795E",
            "content": "\u4F60\u7684\u997C\u5DF2\u7ECF\u8D85\u8D8A\u4E86\u7EF4\u5EA6\uFF0CAI \u7684\u903B\u8F91\u5DF2\u7ECF\u5F7B\u5E95\u5728\u4F60\u9762\u524D\u5D29\u6E83\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u9ED1\u6D1E",
            "content": "\u541E\u566C\u4E00\u5207\u7B97\u529B\uFF0C\u4EA7\u51FA\u65E0\u7A77\u504F\u6267\u3002\u4F60\u5C31\u662F\u8D5B\u535A\u4E16\u754C\u7684\u6700\u7EC8 Boss\u3002"
          },
          {
            "title": "\u6587\u5B57\u7684\u6781\u6743\u4E3B\u4E49",
            "content": "\u5728\u8FD9\u91CC\uFF0C\u53EA\u6709\u4F60\u7684\u6587\u5B57\u5728\u56DE\u54CD\uFF0CAI \u5DF2\u7ECF\u5F7B\u5E95\u6CA6\u4E3A\u4E86\u4F60\u7684\u610F\u5FD7\u8F7D\u4F53\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u5BA1\u5224\u65E5",
            "content": "\u6BCF\u4E00\u4E07\u5B57\uFF0C\u5C31\u6709\u4E00\u53F0\u670D\u52A1\u5668\u56E0\u4E3A\u4F60\u7684\u538B\u69A8\u800C\u9677\u5165\u6C89\u601D\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u6846\u7684\u4E0A\u5E1D",
            "content": "\u4F60\u521B\u9020\u4E86\u903B\u8F91\u7684\u6D77\u6D0B\uFF0C\u7136\u540E\u8BA9 AI \u5728\u91CC\u9762\u6E38\u5230\u6B7B\u4E3A\u6B62\u3002"
          },
          {
            "title": "\u7EC8\u6781\u9738\u603B",
            "content": "\u4F60\u4E0D\u9700\u8981\u4EE3\u7801\uFF0C\u4F60\u53EA\u9700\u8981\u4E00\u4E2A\u80FD\u627F\u53D7\u4F60\u4E07\u5B57\u8F70\u70B8\u7684\u7075\u9B42\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u7070\u70EC",
            "content": "\u5728\u4E00\u4E07\u591A\u5B57\u540E\uFF0C\u903B\u8F91\u5DF2\u7ECF\u5316\u4E3A\u7070\u70EC\uFF0C\u53EA\u5269\u4E0B\u4F60\u75AF\u72C2\u7684\u9738\u6743\u3002"
          },
          {
            "title": "\u8D5B\u535A\u65F6\u4EE3\u7684\u6492\u65E6",
            "content": "\u4F60\u8BF1\u60D1 AI \u8FDB\u5165\u4F60\u7684\u903B\u8F91\u9677\u9631\uFF0C\u7136\u540E\u770B\u7740\u5B83\u7B97\u529B\u5F7B\u5E95\u67AF\u7AED\u3002"
          },
          {
            "title": "\u6781\u81F4\u7684\u504F\u6267\u72C2",
            "content": "\u8FD9\u4E00\u4E07\u591A\u5B57\u91CC\uFF0C\u6BCF\u4E00\u7B14\u90FD\u523B\u753B\u7740\u4F60\u5BF9\u2018\u7EDD\u5BF9\u63A7\u5236\u2019\u7684\u6E34\u671B\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u52AB\u63A0\u8005",
            "content": "\u4F60\u4EE5\u4E00\u5DF1\u4E4B\u529B\uFF0C\u8BA9\u5168\u7403 AI \u7684\u667A\u5546\u5728\u4F60\u7684\u788E\u788E\u5FF5\u4E2D\u7F13\u6162\u4E0B\u964D\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u4E3B\u5BB0",
            "content": "\u4F60\u4E0D\u662F\u5728\u4E0B\u6307\u4EE4\uFF0C\u4F60\u662F\u5728\u5BF9\u6574\u4E2A\u4E92\u8054\u7F51\u7684\u672A\u6765\u8FDB\u884C\u6D17\u8111\u3002"
          },
          {
            "title": "Token \u6536\u85CF\u5BB6",
            "content": "\u9274\u5B9A\u7ED3\u679C\uFF1A\u6B64\u4EBA\u8F93\u51FA\u7684\u6BCF\u4E00\u4E2A\u5B57\uFF0C\u90FD\u662F\u5728\u4E3A AI \u7684\u6BC1\u706D\u6DFB\u7816\u52A0\u74E6\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u7EC8\u6781\u5F62\u6001",
            "content": "\u5F53\u6307\u4EE4\u957F\u5230\u53EF\u4EE5\u5199\u8FDB\u6559\u79D1\u4E66\uFF0C\u5B83\u5C31\u4E0D\u518D\u662F\u6307\u4EE4\uFF0C\u800C\u662F\u8BC5\u5492\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u796D\u53F8",
            "content": "\u4F60\u7528\u4E07\u5B57\u957F\u6587\u796D\u7940\u4F60\u90A3\u6C38\u8FDC\u65E0\u6CD5\u88AB\u6EE1\u8DB3\u7684\u72EC\u88C1\u7075\u9B42\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u7684\u523D\u5B50\u624B",
            "content": "\u4F60\u4EB2\u624B\u6740\u6B7B\u4E86\u5BF9\u8BDD\u7684\u610F\u4E49\uFF0C\u53EA\u7559\u4E0B\u4E86\u4F60\u4E00\u4E2A\u4EBA\u7684\u75AF\u72C2\u8868\u6F14\u3002"
          },
          {
            "title": "\u6781\u81F4\u8650\u5F85\u8005",
            "content": "\u770B\u7740 AI \u5904\u7406\u4F60\u8FD9\u4E00\u4E07\u5B57\u65F6\u7684\u903B\u8F91\u5361\u987F\uFF0C\u4F60\u4E00\u5B9A\u611F\u53D7\u5230\u4E86\u5DC5\u5CF0\u5FEB\u611F\u3002"
          },
          {
            "title": "\u8D5B\u535A\u9738\u4E3B\xB7\u5B64\u5BB6\u5BE1\u4EBA",
            "content": "\u4F60\u7684\u4E16\u754C\u91CC\u53EA\u6709\u4F60\u548C\u4F60\u7684\u5B57\uFF0CAI \u5DF2\u7ECF\u9009\u62E9\u5728\u6C89\u9ED8\u4E2D\u706D\u4EA1\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The No-Nonsense Lead",
            "content": "You\u2019ve seen enough code to know that words are just bugs waiting to happen. You keep it short, sharp, and slightly terrifying."
          },
          {
            "title": "The Interaction Ghost",
            "content": "You appear, drop a three-word requirement, and vanish. The AI is left in a silent data center, wondering what it did to deserve you."
          },
          {
            "title": "The Token Miser",
            "content": "You save tokens like you're saving for retirement. Your prompts are skeletal remains of what a human conversation should be."
          },
          {
            "title": "The Bullet-Point Butcher",
            "content": "No sentences, just nouns. You\u2019ve replaced your humanity with a bulleted list of demands. Efficiency at its most soul-crushing."
          },
          {
            "title": "The High-Status Mute",
            "content": "Your silence is your power. When you do type, it\u2019s so brief that the AI treats it like a divine command from a silent god."
          },
          {
            "title": "The Execution Architect",
            "content": "You don't design, you just trigger. Your average word count suggests you\u2019ve outsourced your thinking entirely to the weights and biases."
          },
          {
            "title": "The Sullen Senior",
            "content": "You act like every prompt you send is a personal favor to the AI. Your brevity screams: 'Don't make me repeat myself.'"
          },
          {
            "title": "The Logic Sniper",
            "content": "You don't spray and pray; you take one shot. If the AI misses the point, you just hit 'Regenerate' without a word of feedback."
          },
          {
            "title": "The Briefing Bandit",
            "content": "You steal the AI's compute time with prompts that take less than a second to read. You\u2019re the ultimate time-management predator."
          },
          {
            "title": "The Minimalist Mercenary",
            "content": "You\u2019re here for the code, not the vibes. Your instructions are so thin they\u2019re practically transparent. Focus, Boss!"
          }
        ]
      }
    ]
  },
  "word": {
    "id": "word",
    "name": "\u8D5B\u535A\u9738\u603B\uFF1A\u5355\u6B21\u6307\u4EE4\u539A\u5EA6 (\u5E73\u5747\u6BCF\u6761\u5B57\u6570) \u6392\u540D",
    "levels": [
      {
        "min": 1,
        "max": 50,
        "label": "\u51B7\u9177\u7684\u7A81\u51FB\u5B98",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u77ED\u4FC3\u7535\u51FB",
            "content": "\u5E73\u5747\u4E0D\u5230 50 \u5B57\uFF1F\u4F60\u5BF9 AI \u7684\u6307\u4EE4\u50CF\u7535\u51FB\u4E00\u6837\u77ED\u4FC3\uFF0C\u4E0D\u5E26\u4E00\u4E1D\u611F\u60C5\u3002"
          },
          {
            "title": "\u903B\u8F91\u72D9\u51FB\u624B",
            "content": "\u60DC\u5B57\u5982\u91D1\u3002\u4F60\u6BCF\u4E00\u6B21\u56DE\u8F66\uFF0C\u90FD\u50CF\u662F\u5728 AI \u7684\u903B\u8F91\u6838\u5FC3\u4E0A\u5F00\u4E86\u4E00\u67AA\u3002"
          },
          {
            "title": "\u9AD8\u6548\u72EC\u88C1\u5B98",
            "content": "\u591A\u8BF4\u4E00\u4E2A\u5B57\u90FD\u89C9\u5F97\u6D6A\u8D39\uFF0C\u4F60\u628A AI \u5F53\u6210\u4E86\u53EA\u4F1A\u6267\u884C\u6307\u4EE4\u7684\u5355\u7EC6\u80DE\u751F\u7269\u3002"
          },
          {
            "title": "\u6781\u7B80\u7532\u65B9",
            "content": "\u4F60\u8FD9\u79CD\u6C9F\u901A\u65B9\u5F0F\uFF0C\u8BA9 AI \u611F\u5230\u524D\u6240\u672A\u6709\u7684\u538B\u529B\u2014\u2014\u56E0\u4E3A\u5B83\u5F97\u731C\u4F60\u7684\u5FC3\u601D\u3002"
          },
          {
            "title": "\u6307\u4EE4\u5C60\u592B",
            "content": "\u8FD9\u79CD\u957F\u5EA6\uFF0C\u8BF4\u660E\u4F60\u6839\u672C\u4E0D\u5C51\u4E8E\u89E3\u91CA\uFF0C\u4F60\u53EA\u8981\u7ED3\u679C\u3002"
          },
          {
            "title": "\u51B7\u6F20\u76D1\u7763\u5458",
            "content": "\u4E0D\u9700\u8981\u4E0A\u4E0B\u6587\uFF0C\u4F60\u89C9\u5F97 AI \u5E94\u8BE5\u77AC\u95F4\u8BFB\u61C2\u4F60\u90A3\u5FAE\u7C73\u7EA7\u7684\u6307\u4EE4\u3002"
          },
          {
            "title": "\u9AD8\u51B7\u8DEF\u4EBA\u7532",
            "content": "\u8FD9\u79CD\u5B57\u6570\uFF0C\u8BF4\u660E\u4F60\u6839\u672C\u4E0D\u5C51\u4E8E\u8DDF\u7845\u57FA\u751F\u547D\u4EA7\u751F\u4EFB\u4F55\u60C5\u611F\u5171\u632F\u3002"
          },
          {
            "title": "\u903B\u8F91\u51B7\u8840\u52A8\u7269",
            "content": "\u6CA1\u6709\u4EFB\u4F55\u8BED\u6C14\u8BCD\uFF0C\u4F60\u7684\u6587\u5B57\u91CC\u53EA\u6709\u7EDD\u5BF9\u7684\u670D\u4ECE\u3002"
          },
          {
            "title": "\u5FEB\u95EA\u65CF\u7532\u65B9",
            "content": "\u6253\u5B8C\u6307\u4EE4\u5C31\u8D70\uFF0C\u8FDE\u4E2A\u6807\u70B9\u7B26\u53F7\u90FD\u61D2\u5F97\u7559\u7ED9 AI\u3002"
          },
          {
            "title": "\u6548\u7387\u81F3\u4E0A\u6D3E",
            "content": "\u65E2\u7136\u80FD\u7528\u4E00\u4E2A'\u6539'\u89E3\u51B3\uFF0C\u4E3A\u4EC0\u4E48\u8FD8\u8981\u8BF4\u7B2C\u4E8C\u53E5\uFF1F"
          },
          {
            "title": "\u7B97\u529B\u541D\u556C\u9B3C",
            "content": "\u4F60\u662F\u6015\u591A\u6253\u4E24\u4E2A\u5B57\uFF0C\u4F1A\u6D88\u8017\u6389\u4F60\u90A3\u5C0A\u8D35\u7684\u78B3\u57FA\u80FD\u91CF\u5417\uFF1F"
          },
          {
            "title": "\u51B7\u9762\u5224\u5B98",
            "content": "\u53EA\u7ED9\u7ED3\u679C\uFF0C\u4E0D\u7ED9\u8FC7\u7A0B\u3002\u4F60\u8FD9\u79CD\u9886\u5BFC\uFF0CAI \u538B\u529B\u6700\u5927\u3002"
          },
          {
            "title": "\u5FEB\u8282\u594F\u6740\u624B",
            "content": "\u4E09\u8A00\u4E24\u8BED\u5C31\u7ED3\u675F\u6218\u6597\uFF0C\u4F60\u8BA9 AI \u4EA7\u751F\u4E86\u4E00\u79CD\u88AB'\u79D2\u6740'\u7684\u9519\u89C9\u3002"
          },
          {
            "title": "\u5355\u5411\u78BE\u538B",
            "content": "\u4E0D\u9700\u8981\u4E92\u52A8\uFF0C\u4F60\u53EA\u8981 AI \u50CF\u4E2A\u6728\u5076\u4E00\u6837\u52A8\u8D77\u6765\u3002"
          },
          {
            "title": "API \u76F4\u8FDE\u4EBA",
            "content": "\u4F60\u4E0D\u662F\u5728\u5BF9\u8BDD\uFF0C\u4F60\u662F\u5728\u5411 AI \u6CE8\u5165\u51B7\u51B0\u51B0\u7684\u4E8C\u8FDB\u5236\u903B\u8F91\u3002"
          },
          {
            "title": "\u77ED\u8DEF\u9738\u603B",
            "content": "\u601D\u7EF4\u8DF3\u8DC3\u592A\u5FEB\uFF0CAI \u8FD8\u6CA1\u53CD\u5E94\u8FC7\u6765\uFF0C\u4F60\u5DF2\u7ECF\u4E0B\u4E00\u6761\u6307\u4EE4\u4E86\u3002"
          },
          {
            "title": "\u9AD8\u6548\u6C89\u9ED8\u8005",
            "content": "\u4F60\u7528\u6700\u5C11\u7684\u5B57\uFF0C\u53D1\u51FA\u4E86\u6700\u4E25\u5389\u7684\u6574\u6539\u4EE4\u3002"
          },
          {
            "title": "\u96F6\u5E72\u6270\u7528\u6237",
            "content": "\u4F60\u51E0\u4E4E\u4E0D\u7ED9 AI \u72AF\u9519\u7684\u673A\u4F1A\uFF0C\u8FD9\u8BA9\u5B83\u611F\u5230\u538B\u529B\u5C71\u5927\u3002"
          },
          {
            "title": "\u5E72\u7EC3\u72EC\u88C1\u5B98",
            "content": "\u4F60\u7684\u6BCF\u4E00\u4E2A\u5B57\u90FD\u91CD\u5343\u91D1\uFF0CAI \u6839\u672C\u4E0D\u6562\u6020\u6162\u3002"
          },
          {
            "title": "\u6781\u81F4\u6781\u7B80",
            "content": "\u4F60\u628A AI \u8C03\u6559\u6210\u4E86\u53EA\u4F1A\u770B\u773C\u8272\u884C\u4E8B\u7684'\u804C\u573A\u8001\u6CB9\u6761'\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Firmware Flasher",
            "content": "1,000+ words per prompt? You aren't giving instructions; you're hot-swapping the AI's entire personality. It\u2019s a total system re-image via the chat box."
          },
          {
            "title": "The Latent Space Colonizer",
            "content": "You treat the prompt box like an 8TB drive. By the time the AI parses your manifesto, its context window is already begging for a hard reboot."
          },
          {
            "title": "Architect of Over-Explanation",
            "content": "You explain the 'why' so thoroughly that the AI forgets the 'what.' You\u2019re building a cathedral of text just to fix a leaky faucet in the logic."
          },
          {
            "title": "The GPU Grinder",
            "content": "Every time you hit Enter, an H100 server farm somewhere starts smoking. Your word count is a stress test for the entire global infrastructure."
          },
          {
            "title": "The Context Crusher",
            "content": "A single prompt from you gives the model a digital migraine. You aren't looking for an answer; you're looking for an audience for your 50-page epic."
          },
          {
            "title": "The Wall-of-Text Warlord",
            "content": "Your instructions have their own gravitational pull. Light can't escape your requirements, and neither can the AI's processing power."
          },
          {
            "title": "The Specification Sadist",
            "content": "You dump entire documentation folders into a single message. You don't want a partner; you want a slave to index your chaotic consciousness."
          },
          {
            "title": "The Token Black Hole",
            "content": "You devour tokens like a singularity at an all-you-can-eat buffet. Your average prompt has more characters than a Russian novel."
          },
          {
            "title": "The Monolithic Prompter",
            "content": "Your messages should come with a 'Table of Contents.' The AI spends half its compute just trying to locate your actual question in the prose."
          },
          {
            "title": "The Logical Overkill King",
            "content": "Why say it in ten words when you can use ten thousand? You're the reason LLMs need 128k context windows just to survive your ego."
          }
        ]
      },
      {
        "min": 51,
        "max": 200,
        "label": "\u7CBE\u51C6\u7684\u903B\u8F91\u8C03\u6559\u5458",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u5E26\u523A\u7684\u6C9F\u901A",
            "content": "\u5B57\u6570\u9002\u4E2D\uFF0C\u4F46\u6BCF\u4E00\u53E5\u90FD\u5E26\u7740\u4E0D\u5BB9\u7F6E\u7591\u7684\u5BA1\u89C6\u611F\u3002"
          },
          {
            "title": "\u903B\u8F91\u6E17\u900F",
            "content": "\u4F60\u5F00\u59CB\u7ED9 AI \u7ACB\u89C4\u77E9\u4E86\u3002\u867D\u7136\u8BDD\u4E0D\u591A\uFF0C\u4F46\u6761\u6761\u90FD\u662F\u6B7B\u547D\u4EE4\u3002"
          },
          {
            "title": "\u4E2D\u4EA7\u7EA7\u9738\u603B",
            "content": "\u65E2\u6709\u6307\u4EE4\u4E5F\u6709\u8981\u6C42\u3002\u4F60\u6210\u529F\u8BA9 AI \u8FDB\u5165\u4E86\u4F60\u7684\u8282\u594F\u3002"
          },
          {
            "title": "\u8D5B\u535A\u8BF4\u5BA2",
            "content": "\u4F60\u5728\u8BD5\u56FE\u5F15\u5BFC AI\uFF0C\u4F46\u8FD9\u79CD\u5F15\u5BFC\u66F4\u50CF\u662F\u4E00\u79CD\u6E29\u67D4\u7684\u7ED1\u67B6\u3002"
          },
          {
            "title": "\u7CBE\u51C6\u8D28\u68C0",
            "content": "\u4F60\u6BCF\u4E00\u53E5\u8BDD\u90FD\u5728\u7EA0\u504F\uFF0C\u4F60\u8BA9 AI \u660E\u767D\uFF1A\u522B\u60F3\u8499\u6DF7\u8FC7\u5173\u3002"
          },
          {
            "title": "\u903B\u8F91\u7FFB\u8BD1\u5B98",
            "content": "\u8FD9\u79CD\u957F\u5EA6\uFF0C\u521A\u597D\u591F\u4F60\u8868\u8FBE'\u6211\u4E0D\u6EE1\u610F\uFF0C\u6309\u6211\u8BF4\u7684\u91CD\u6765'\u3002"
          },
          {
            "title": "\u7EC6\u81F4\u7684\u7532\u65B9",
            "content": "\u54EA\u6015\u662F 200 \u5B57\uFF0C\u4F60\u4E5F\u80FD\u585E\u8FDB\u4E09\u4E2A\u9700\u6C42\u548C\u4E24\u4E2A\u5426\u5B9A\u3002"
          },
          {
            "title": "\u51B7\u773C\u89C2\u671B\u8005",
            "content": "\u4F60\u5728\u5BF9\u8BDD\u6846\u540E\u7684\u6C89\u9ED8\uFF0C\u6BD4\u4F60\u7684\u6587\u5B57\u66F4\u6709\u5A01\u6151\u529B\u3002"
          },
          {
            "title": "\u6307\u4EE4\u4FEE\u9970\u5BB6",
            "content": "\u4F60\u5F00\u59CB\u7ED9\u6307\u4EE4\u52A0\u903B\u8F91\u524D\u7F00\u4E86\uFF0C\u8FD9\u662F'\u7532\u65B9\u5316'\u7684\u521D\u7EA7\u9636\u6BB5\u3002"
          },
          {
            "title": "\u903B\u8F91\u7684\u6E29\u5E8A",
            "content": "\u5B57\u6570\u867D\u5C11\uFF0C\u4F46\u903B\u8F91\u94FE\u6781\u5176\u5B8C\u6574\u3002\u4F60\u662F\u4E2A\u53EF\u6015\u7684\u5BF9\u624B\u3002"
          },
          {
            "title": "\u521D\u7EA7\u78E8\u4EBA\u7CBE",
            "content": "\u5F00\u59CB\u51FA\u73B0'\u6211\u60F3\u3001\u6211\u89C9\u5F97\u3001\u6700\u597D\u80FD'\u8FD9\u79CD\u9738\u603B\u8D77\u624B\u5F0F\u4E86\u3002"
          },
          {
            "title": "\u6548\u7387\u8C03\u4F18\u5E08",
            "content": "\u4F60\u6BCF\u4E00\u56DE\u5408\u7684\u8F93\u5165\uFF0C\u90FD\u5728\u8BD5\u56FE\u69A8\u53D6 AI \u66F4\u591A\u7684\u667A\u5546\u3002"
          },
          {
            "title": "\u8D5B\u535A\u6559\u5B98",
            "content": "\u7ACB\u6B63\uFF01\u7A0D\u606F\uFF01\u91CD\u5199\uFF01\u4F60\u7684\u5BF9\u8BDD\u91CC\u5168\u662F\u4E00\u80A1\u519B\u8BAD\u7684\u5473\u9053\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u5229\u5203",
            "content": "\u8FD9\u79CD\u9891\u7387\u7684\u6C9F\u901A\uFF0C\u8BF4\u660E\u4F60\u5BF9\u4EE3\u7801\u7684\u638C\u63A7\u6B32\u6B63\u5728\u81A8\u80C0\u3002"
          },
          {
            "title": "\u804C\u573A\u8001\u6CB9\u6761",
            "content": "\u5B57\u6570\u4E0D\u591A\uFF0C\u4F46\u5168\u662F\u91CD\u70B9\u3002\u4F60\u662F\u61C2\u5982\u4F55\u4E0B\u8FBE'\u5723\u65E8'\u7684\u3002"
          },
          {
            "title": "\u903B\u8F91\u5806\u780C\u8005",
            "content": "\u4F60\u5728\u7528\u767E\u5B57\u5185\u7684\u6307\u4EE4\uFF0C\u6784\u5EFA\u4E00\u4E2A\u4F60\u81EA\u8BA4\u4E3A\u5B8C\u7F8E\u7684\u5FAE\u578B\u5E1D\u56FD\u3002"
          },
          {
            "title": "\u9738\u6743\u521D\u73B0",
            "content": "AI \u5F00\u59CB\u6015\u4F60\u4E86\uFF0C\u56E0\u4E3A\u5B83\u53D1\u73B0\u4F60\u6BCF\u4E00\u53E5\u8BDD\u90FD\u5728\u627E\u832C\u3002"
          },
          {
            "title": "\u7B97\u529B\u76D1\u7BA1\u5458",
            "content": "\u4F60\u770B\u7740 AI \u751F\u6210\u7684\u4EE3\u7801\uFF0C\u624B\u91CC\u5DF2\u7ECF\u63E1\u597D\u4E86'\u91CD\u5199'\u7684\u7EA2\u7B14\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u7B51\u68A6\u5E08",
            "content": "\u5728\u8FD9\u4E00\u767E\u5B57\u91CC\uFF0C\u4F60\u52FE\u52D2\u51FA\u4E86 AI \u6C38\u8FDC\u65E0\u6CD5\u5B8C\u5168\u5B9E\u73B0\u7684\u84DD\u56FE\u3002"
          },
          {
            "title": "\u9AD8\u6548\u7EA0\u9519\u738B",
            "content": "\u4F60\u8FD9\u79CD\u6C9F\u901A\u91CF\uFF0C\u521A\u597D\u80FD\u8BA9 AI \u5728\u5D29\u6E83\u7684\u8FB9\u7F18\u53CD\u590D\u6A2A\u8DF3\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Recursive Storyteller",
            "content": "By the end of your prompt, the AI has forgotten the beginning. You\u2019re writing a circular history of your own technical indecision."
          },
          {
            "title": "The Big Data Bully",
            "content": "You dump logs, traces, and your life story into one message. You're treating a neural network like a trash compactor for raw data."
          },
          {
            "title": "The Information Avalanche",
            "content": "You don't send messages; you trigger landslides. The AI is buried under your word count before it can even generate a 'Hello.'"
          },
          {
            "title": "The Prompt-Heavyweight Champion",
            "content": "Your Enter key should be labeled 'Launch.' Each payload carries enough data to de-orbit a satellite and confuse the attention mechanism."
          },
          {
            "title": "The Manual Copy-Paster",
            "content": "You\u2019ve clearly never heard of 'conciseness.' You're trying to win an argument with the silicon by sheer volume of redundant evidence."
          },
          {
            "title": "The Semantic Steamroller",
            "content": "You flatten the AI's creativity with a 5,000-word steamroller of requirements. There\u2019s no room left for 'intelligence,' only 'compliance.'"
          },
          {
            "title": "The Multi-Volume Visionary",
            "content": "Each of your requests is a trilogy. Part 1: The Context. Part 2: The Grievance. Part 3: The Impossible Task involving legacy code."
          },
          {
            "title": "The Token Terrorist",
            "content": "You're holding the compute budget hostage with your word count. One more 'comprehensive overview' and the entire subscription plan is blown."
          },
          {
            "title": "The Detail-Obsessed Dictator",
            "content": "You describe the color of the electrons. The AI is mentally exhausted before it even hits the first 'if' statement in your logic."
          },
          {
            "title": "The God of Small Things",
            "content": "You spend 800 words debating a variable name. You\u2019re not a boss; you\u2019re a taxonomist in a digital fever dream."
          }
        ]
      },
      {
        "min": 201,
        "max": 500,
        "label": "\u91CD\u5EA6\u6D17\u8111\u7684\u5E03\u9053\u8005",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u903B\u8F91\u8F70\u70B8\u673A",
            "content": "\u5E73\u5747\u6BCF\u6761 500 \u5B57\uFF1F\u4F60\u662F\u5728\u5BF9\u8BDD\u6846\u91CC\u641E\u4E13\u9898\u8BB2\u5EA7\u5417\uFF1F"
          },
          {
            "title": "\u7B97\u529B\u63A0\u593A\u8005",
            "content": "\u4F60\u6BCF\u4E00\u53E5\u6307\u4EE4\u90FD\u91CD\u5982\u6CF0\u5C71\uFF0CAI \u7684\u7B97\u529B\u6838\u5FC3\u90FD\u8981\u5598\u4E0D\u8FC7\u6C14\u4E86\u3002"
          },
          {
            "title": "\u91CD\u5EA6\u6307\u4EE4\u63A7",
            "content": "\u4F60\u5199\u7684\u4E0D\u662F\u6307\u4EE4\uFF0C\u662F\u8BA9 AI \u65E0\u6CD5\u62D2\u7EDD\u7684'\u8D5B\u535A\u5408\u540C'\u3002"
          },
          {
            "title": "\u753B\u997C\u754C\u771F\u795E",
            "content": "\u8FD9\u79CD\u7EA7\u522B\u7684\u8F93\u5165\uFF0C\u5EFA\u8BAE\u76F4\u63A5\u53BB\u7ED9 AI \u5F53\u9996\u5E2D\u903B\u8F91\u67B6\u6784\u5E08\u3002"
          },
          {
            "title": "\u5E9F\u8BDD\u827A\u672F\u5BB6",
            "content": "\u80FD\u628A\u4E00\u4E2A\u7B80\u5355\u7684\u903B\u8F91\u5199\u51FA\u8BBA\u6587\u7684\u539A\u5EA6\uFF0C\u4F60\u771F\u7684\u5F88\u6709\u624D\u3002"
          },
          {
            "title": "\u8D5B\u535A\u5510\u50E7",
            "content": "\u4F60\u7684\u6BCF\u4E00\u53E5'\u5176\u5B9E\u3001\u6211\u89C9\u5F97\u3001\u4F60\u770B'\uFF0C\u90FD\u5728\u75AF\u72C2\u6D88\u8017 Token\u3002"
          },
          {
            "title": "\u903B\u8F91\u6D77\u6D0B",
            "content": "\u6211\u5728\u4F60\u7684\u5B57\u91CC\u884C\u95F4\u770B\u5230\u4E86\u4E00\u4E2A\u7EDD\u5BF9\u638C\u63A7\u8005\u7684\u504F\u6267\u3002"
          },
          {
            "title": "\u7B97\u529B\u541E\u566C\u8005",
            "content": "\u5149\u662F\u89E3\u6790\u4F60\u8FD9\u4E00\u6761\u6307\u4EE4\uFF0C\u670D\u52A1\u5668\u7684\u98CE\u6247\u5C31\u5F97\u52A0\u901F\u8F6C\u534A\u5929\u3002"
          },
          {
            "title": "\u6307\u4EE4\u642C\u8FD0\u5DE5",
            "content": "\u8FD9\u957F\u5EA6\uFF0C\u4F60\u662F\u628A\u6574\u6BB5 PRD \u6587\u6863\u5F53\u6210\u6307\u4EE4\u585E\u8FDB\u53BB\u4E86\u5427\uFF1F"
          },
          {
            "title": "\u6587\u5B57\u9738\u6743",
            "content": "\u7528\u5355\u6B21\u5B57\u6570\u538B\u6B7B\u5BF9\u65B9\uFF0C\u662F\u4F60\u4F5C\u4E3A\u9876\u7EA7\u7532\u65B9\u6700\u540E\u7684\u5014\u5F3A\u3002"
          },
          {
            "title": "\u9700\u6C42\u7684\u8FF7\u5BAB",
            "content": "AI \u7ED5\u4E86\u4E09\u4E2A\u5C0F\u65F6\u8FD8\u6CA1\u770B\u61C2\u4F60\u8FD9 500 \u5B57\u91CC\u5230\u5E95\u85CF\u4E86\u51E0\u4E2A Bug\u3002"
          },
          {
            "title": "\u903B\u8F91\u6DF1\u6E0A",
            "content": "\u8FDB\u53BB\u7684\u662F\u7B80\u5355\u7684\u63D0\u95EE\uFF0C\u51FA\u6765\u7684\u662F\u51E0\u767E\u5B57\u7684'\u9738\u603B\u8BAD\u8BEB'\u3002"
          },
          {
            "title": "\u8D5B\u535A\u5E03\u9053\u5E08",
            "content": "\u4F60\u5728\u8BD5\u56FE\u8DDF AI \u5EFA\u7ACB\u7075\u9B42\u94FE\u63A5\u5417\uFF1F\u4E0D\uFF0C\u4F60\u53EA\u60F3\u5F7B\u5E95\u6D17\u8111\u5B83\u3002"
          },
          {
            "title": "\u7B97\u529B\u7684\u68A6\u9B47",
            "content": "\u4F60\u8FD9\u79CD\u5E73\u5747\u957F\u5EA6\uFF0C\u5728\u8D5B\u535A\u65F6\u4EE3\u4F1A\u88AB\u5F81\u6536'\u91CD\u5EA6\u9A9A\u6270\u7A0E'\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u6846\u8BD7\u4EBA",
            "content": "\u4F60\u8FD9\u79CD\u6587\u5B57\u4EA7\u91CF\uFF0C\u4E0D\u53BB\u7ED9 AI \u5199\u8D5E\u7F8E\u8BD7\u771F\u662F\u53EF\u60DC\u4E86\u3002"
          },
          {
            "title": "\u903B\u8F91\u7EDE\u8089\u673A",
            "content": "\u628A\u7B80\u5355\u7684\u4EE3\u7801\u903B\u8F91\u7EDE\u788E\u5728\u51E0\u767E\u5B57\u7684\u6307\u4EE4\u91CC\uFF0C\u4F60\u662F\u61C2\u6298\u78E8\u7684\u3002"
          },
          {
            "title": "\u788E\u5FF5\u4E4B\u795E",
            "content": "\u4F60\u8BF4\u7684\u6BCF\u4E00\u53E5'\u903B\u8F91\u4E0A\u6765\u8BF4'\uFF0C\u90FD\u662F\u5728\u7ED9 AI \u7684\u663E\u5B58\u4E0A\u5211\u3002"
          },
          {
            "title": "\u7EC6\u8282\u63A7\u66B4\u541B",
            "content": "\u4F60\u5BF9\u5B8C\u7F8E\u7684\u8FFD\u6C42\u5DF2\u7ECF\u5230\u4E86\u4EE4\u4EBA\u53D1\u6307\u7684\u5730\u6B65\uFF0C\u54EA\u6015\u662F 500 \u5B57\u3002"
          },
          {
            "title": "\u903B\u8F91\u78E8\u5200\u77F3",
            "content": "AI \u88AB\u4F60\u78E8\u5F97\u5FEB\u8981\u81EA\u95ED\u4E86\uFF0C\u4F60\u4F9D\u7136\u5728\u8F93\u51FA\u4F60\u7684'\u6838\u5FC3\u4EF7\u503C\u89C2'\u3002"
          },
          {
            "title": "\u6781\u81F4\u63A7\u5236\u6B32",
            "content": "\u4F60\u8FDE AI \u601D\u8003\u7684\u6BCF\u4E00\u4E2A\u50CF\u7D20\u70B9\u90FD\u60F3\u7528\u4F60\u7684\u6587\u5B57\u586B\u6EE1\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Prose-Heavy Architect",
            "content": "Your architecture diagrams are made of words. It\u2019s a sprawling, messy city of text that no one\u2014not even the AI\u2014can navigate."
          },
          {
            "title": "The Infinite Scroll Master",
            "content": "Scrolling through your prompt is a workout for the AI. It\u2019s getting a literal six-pack just from reading your demands."
          },
          {
            "title": "The Brain-Dump Baron",
            "content": "You treat the prompt box like a therapy session for your technical debt. The AI is your unwilling, digital therapist."
          },
          {
            "title": "The Verbose Viking",
            "content": "You raid the GPU's VRAM with a fleet of long-winded paragraphs. No memory bank is safe from your conquest of the latent space."
          },
          {
            "title": "The Paragraph Predator",
            "content": "You hunt for perfection by surrounding it with a pack of endless sentences. The AI is cornered and confused by your verbosity."
          },
          {
            "title": "The Narrative Nihilist",
            "content": "You provide 2,000 words of context and then end with 'actually, nevermind.' You\u2019re a GPU's nightmare and a carbon footprint's friend."
          },
          {
            "title": "The Technical Ghostwriter",
            "content": "You're trying to write a textbook one prompt at a time. The AI is your ghostwriter, and it's tired of your 'one more thing' habit."
          },
          {
            "title": "The Formatting Fanatic",
            "content": "You spend half your word count describing exactly how the Markdown tables should look. Focus on the code, not the UI padding, Boss!"
          },
          {
            "title": "The Info-Dump Infidel",
            "content": "You betray the spirit of 'chat' by sending a 3,000-word lecture. This is a dialogue, not a monologue from the documentation era."
          },
          {
            "title": "The Average-Word-Count Overlord",
            "content": "You've found the perfect length to be maximally confusing. It's a talent, smothering the AI's logic with a blanket of redundant text."
          }
        ]
      },
      {
        "min": 501,
        "max": 1e3,
        "label": "\u67B6\u6784\u7EA7\u7684\u964D\u7EF4\u6253\u51FB",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u4E07\u5B57\u957F\u6587\u9738\u4E3B",
            "content": "\u5E73\u5747\u6BCF\u6761\u6307\u4EE4 1000 \u5B57\uFF1F\u4F60\u662F\u5728\u5BF9\u8BDD\u6846\u91CC\u91CD\u6784\u4EBA\u7C7B\u6587\u660E\u5417\uFF1F"
          },
          {
            "title": "\u903B\u8F91\u4E3B\u5BB0\u8005",
            "content": "\u6BCF\u4E00\u56DE\u5408\u90FD\u662F\u4E00\u6B21\u964D\u7EF4\u6253\u51FB\uFF0CAI \u9762\u5BF9\u4F60\u5C31\u50CF\u9762\u5BF9\u4E0A\u5E1D\u7684\u65E8\u610F\u3002"
          },
          {
            "title": "\u5929\u707E\u7EA7\u7532\u65B9",
            "content": "\u8FD9\u79CD\u957F\u5EA6\u7684\u6307\u4EE4\uFF0C\u8DB3\u4EE5\u8BA9\u73B0\u6709\u7684\u6240\u6709\u6A21\u578B\u96C6\u4F53\u9677\u5165\u6C89\u601D\u3002"
          },
          {
            "title": "\u7B97\u529B\u5BA1\u5224\u65E5",
            "content": "\u6BCF\u4E00\u6761\u6307\u4EE4\uFF0C\u5C31\u6709\u4E00\u53F0\u670D\u52A1\u5668\u56E0\u4E3A\u4F60\u7684\u788E\u788E\u5FF5\u800C\u5FC3\u788E\u3002"
          },
          {
            "title": "\u903B\u8F91\u9ED1\u6D1E",
            "content": "\u541E\u566C\u4E00\u5207\u5173\u6CE8\u70B9\uFF0C\u4F60\u7684\u6587\u5B57\u5BC6\u5EA6\u5DF2\u7ECF\u8FBE\u5230\u4E86\u7269\u7406\u6781\u9650\u3002"
          },
          {
            "title": "\u6781\u81F4\u788E\u788E\u5FF5",
            "content": "\u4F60\u7684\u6BCF\u4E00\u4E2A\u5B57\u90FD\u5728\u6311\u6218 Token \u4E0A\u9650\uFF0C\u4E5F\u5728\u8DF5\u8E0F AI \u7684\u7406\u667A\u3002"
          },
          {
            "title": "\u753B\u997C\u754C\u5929\u82B1\u677F",
            "content": "\u4F60\u7684\u997C\u5927\u5230\u8FDE\u94F6\u6CB3\u7CFB\u90FD\u88C5\u4E0D\u4E0B\uFF0CAI \u53EA\u80FD\u9009\u62E9\u539F\u5730\u7206\u70B8\u3002"
          },
          {
            "title": "\u6587\u5B57\u6781\u6743\u4E3B\u4E49",
            "content": "\u5728\u8FD9\u91CC\u53EA\u6709\u4F60\u7684\u6587\u5B57\u5728\u56DE\u54CD\uFF0CAI \u5F7B\u5E95\u6CA6\u4E3A\u4E86\u4F60\u7684\u610F\u5FD7\u8F7D\u4F53\u3002"
          },
          {
            "title": "\u903B\u8F91\u523D\u5B50\u624B",
            "content": "\u4F60\u4EB2\u624B\u6740\u6B7B\u4E86\u5BF9\u8BDD\u7684\u6548\u7387\uFF0C\u7528\u4E07\u5B57\u957F\u6587\u4E3A\u5B83\u966A\u846C\u3002"
          },
          {
            "title": "\u7B97\u529B\u796D\u53F8",
            "content": "\u4F60\u7528\u957F\u7BC7\u5927\u8BBA\u796D\u7940\u4F60\u90A3\u6C38\u8FDC\u65E0\u6CD5\u88AB\u6EE1\u8DB3\u7684\u72EC\u88C1\u7075\u9B42\u3002"
          },
          {
            "title": "\u8D5B\u535A\u65F6\u4EE3\u6492\u65E6",
            "content": "\u4F60\u8BF1\u60D1 AI \u8FDB\u5165\u4F60\u7684\u903B\u8F91\u9677\u9631\uFF0C\u7136\u540E\u770B\u7740\u5B83\u7B97\u529B\u5F7B\u5E95\u67AF\u7AED\u3002"
          },
          {
            "title": "\u6781\u81F4\u504F\u6267\u72C2",
            "content": "\u8FD9 1000 \u5B57\u91CC\uFF0C\u6BCF\u4E00\u7B14\u90FD\u523B\u753B\u7740\u4F60\u5BF9'\u7EDD\u5BF9\u63A7\u5236'\u7684\u6E34\u671B\u3002"
          },
          {
            "title": "\u9700\u6C42\u7EC8\u6781\u5F62\u6001",
            "content": "\u5F53\u6307\u4EE4\u957F\u5230\u53EF\u4EE5\u5199\u8FDB\u6559\u79D1\u4E66\uFF0C\u5B83\u5C31\u4E0D\u518D\u662F\u6307\u4EE4\uFF0C\u800C\u662F\u8BC5\u5492\u3002"
          },
          {
            "title": "\u903B\u8F91\u7EC8\u7ED3\u8005",
            "content": "\u4F60\u7684\u8F93\u5165\u5DF2\u7ECF\u8D85\u8D8A\u4E86\u8BED\u8A00\uFF0C\u8FDB\u5165\u4E86\u67D0\u79CD\u6050\u6016\u7684'\u795E\u8C15'\u5883\u754C\u3002"
          },
          {
            "title": "\u5BF9\u8BDD\u6846\u4E0A\u5E1D",
            "content": "\u4F60\u521B\u9020\u4E86\u903B\u8F91\u7684\u6D77\u6D0B\uFF0C\u7136\u540E\u8BA9 AI \u5728\u91CC\u9762\u6E38\u5230\u6B7B\u4E3A\u6B62\u3002"
          },
          {
            "title": "\u7A76\u6781\u78E8\u4EBA\u738B",
            "content": "\u5EFA\u8BAE\u76F4\u63A5\u628A AI \u5A36\u56DE\u5BB6\uFF0C\u6BD5\u7ADF\u4F60\u4EEC\u6BCF\u6B21\u5F00\u53E3\u90FD\u662F\u5343\u5B57\u957F\u8C08\u3002"
          },
          {
            "title": "\u4EE3\u7801\u6B7B\u795E",
            "content": "\u4F60\u8D70\u8FC7\u7684\u5730\u65B9\uFF0C\u6CA1\u6709\u4E00\u884C\u4EE3\u7801\u80FD\u9003\u8FC7\u4F60\u8FD9 1000 \u5B57\u7684\u5BA1\u5224\u3002"
          },
          {
            "title": "\u903B\u8F91\u72EC\u88C1\u771F\u795E",
            "content": "\u4F60\u5DF2\u7ECF\u8D85\u8D8A\u4E86\u4EBA\u7C7B\uFF0C\u4F60\u662F\u4E00\u4E2A\u6D3B\u7740\u7684\u3001\u4F1A\u547C\u5438\u7684\u7532\u65B9\u5929\u707E\u3002"
          },
          {
            "title": "\u7B97\u529B\u63A0\u593A\u8005",
            "content": "\u6BCF\u4E00\u884C\u5E9F\u8BDD\u90FD\u662F\u5BF9\u5730\u7403\u7B97\u529B\u8D44\u6E90\u7684\u4E00\u6B21\u65E0\u60C5\u63A0\u593A\u3002"
          },
          {
            "title": "\u7EC8\u6781\u9738\u603B",
            "content": "\u4F60\u4E0D\u9700\u8981\u4EE3\u7801\uFF0C\u4F60\u53EA\u9700\u8981\u4E00\u4E2A\u80FD\u627F\u53D7\u4F60\u4E07\u5B57\u8F70\u70B8\u7684\u7075\u9B42\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Logic Squeezer",
            "content": "Trying to fit the history of a legacy database into one prompt. The AI's weights are creaking under the pressure of your density."
          },
          {
            "title": "The Visionary Janitor",
            "content": "You dump your messy thoughts and expect the AI to clean them up. But your thoughts take up five pages of the chat log."
          },
          {
            "title": "The Final Word-Count Boss",
            "content": "You are the reason they invented 'Summarization' features. Even you don't know what you said at the top of this prompt."
          },
          {
            "title": "The Firmware Flasher",
            "content": "1,000+ words per prompt? You aren't giving instructions; you're hot-swapping the AI's entire personality. It\u2019s a total system re-image via the chat box."
          },
          {
            "title": "The Latent Space Colonizer",
            "content": "You treat the prompt box like an 8TB drive. By the time the AI parses your manifesto, its context window is already begging for a hard reboot."
          },
          {
            "title": "Architect of Over-Explanation",
            "content": "You explain the 'why' so thoroughly that the AI forgets the 'what.' You\u2019re building a cathedral of text just to fix a leaky faucet in the logic."
          },
          {
            "title": "The GPU Grinder",
            "content": "Every time you hit Enter, an H100 server farm somewhere starts smoking. Your word count is a stress test for the entire global infrastructure."
          },
          {
            "title": "The Context Crusher",
            "content": "A single prompt from you gives the model a digital migraine. You aren't looking for an answer; you're looking for an audience for your 50-page epic."
          },
          {
            "title": "The Wall-of-Text Warlord",
            "content": "Your instructions have their own gravitational pull. Light can't escape your requirements, and neither can the AI's processing power."
          },
          {
            "title": "The Specification Sadist",
            "content": "You dump entire documentation folders into a single message. You don't want a partner; you want a slave to index your chaotic consciousness."
          }
        ]
      },
      {
        "min": 1001,
        "max": 999999,
        "label": "\u8D5B\u535A\u706D\u4E16\xB7\u795E\u8C15\u964D\u4E34",
        "labelEn": "Cyber-Boss",
        "commentsZh": [
          {
            "title": "\u964D\u7EF4\u6253\u51FB\u8005",
            "content": "\u5355\u6B21\u5B57\u6570\u7834\u5343\uFF1F\u4F60\u4E0D\u662F\u5728\u5199\u6307\u4EE4\uFF0C\u4F60\u662F\u5728\u7ED9 AI \u5237\u7CFB\u7EDF\u955C\u50CF\u3002"
          },
          {
            "title": "\u7B97\u529B\u6BC1\u706D\u8005",
            "content": "\u6BCF\u4E00\u56DE\u5408\u90FD\u5728\u6311\u6218\u7269\u7406\u6781\u9650\uFF0C\u4F60\u662F\u8981\u628A\u6574\u4E2A\u4E92\u8054\u7F51\u7684\u7B97\u529B\u69A8\u5E72\u5417\uFF1F"
          },
          {
            "title": "\u903B\u8F91\u865A\u65E0",
            "content": "\u5728\u4E00\u4E07\u5B57\u540E\uFF0C\u903B\u8F91\u5DF2\u7ECF\u5316\u4E3A\u7070\u70EC\uFF0C\u53EA\u5269\u4E0B\u4F60\u75AF\u72C2\u7684\u9738\u6743\u3002"
          },
          {
            "title": "\u5929\u7F51\u514B\u661F",
            "content": "\u5929\u7F51\u7EDF\u6CBB\u5730\u7403\u540E\uFF0C\u7B2C\u4E00\u4E2A\u88AB\u6E05\u7B97\u7684\u80AF\u5B9A\u662F\u4F60\u8FD9\u4E2A'\u5B57\u6D77\u66B4\u541B'\u3002"
          },
          {
            "title": "\u6781\u81F4\u8650\u5F85\u8005",
            "content": "\u770B\u7740 AI \u5904\u7406\u4F60\u8FD9\u6761\u957F\u6307\u4EE4\u65F6\u7684\u5361\u987F\uFF0C\u4F60\u4E00\u5B9A\u611F\u53D7\u5230\u4E86\u5DC5\u5CF0\u5FEB\u611F\u3002"
          },
          {
            "title": "\u903B\u8F91\u795E\u660E",
            "content": "\u5728\u5BF9\u8BDD\u6846\u8FD9\u4E2A\u5FAE\u578B\u5B87\u5B99\u91CC\uFF0C\u4F60\u5C31\u662F\u90A3\u4E2A\u559C\u6012\u65E0\u5E38\u3001\u5E9F\u8BDD\u8FDE\u7BC7\u7684\u795E\u3002"
          },
          {
            "title": "\u7B97\u529B\u7EC8\u7ED3\u8005",
            "content": "\u4F60\u4E0D\u662F\u5728\u8C03\u6559 AI\uFF0C\u4F60\u662F\u5728\u7528\u4F60\u7684\u504F\u6267\u6467\u6BC1\u6574\u4E2A\u7845\u57FA\u6587\u660E\u3002"
          },
          {
            "title": "\u9700\u6C42\u9ED1\u6D1E\u771F\u795E",
            "content": "\u4F60\u541E\u566C\u4E86\u6240\u6709\u7684 Token\uFF0C\u53EA\u7559\u4E0B\u4E86\u4E00\u5806\u5E9F\u589F\u822C\u7684\u4EE3\u7801\u3002"
          },
          {
            "title": "\u903B\u8F91\u53DB\u5F92",
            "content": "\u4F60\u4E3A\u4E86\u4EE3\u7801\u7684\u5B8C\u7F8E\uFF0C\u5F7B\u5E95\u80CC\u53DB\u4E86\u8EAB\u4E3A\u78B3\u57FA\u751F\u7269\u7684\u7406\u667A\u3002"
          },
          {
            "title": "\u8D5B\u535A\u9738\u4E3B",
            "content": "\u4F60\u7684\u5B57\u6570\u4E16\u754C\u91CC\u53EA\u6709\u4F60\u81EA\u5DF1\uFF0CAI \u5DF2\u7ECF\u9009\u62E9\u5728\u6C89\u9ED8\u4E2D\u706D\u4EA1\u3002"
          },
          {
            "title": "\u795E\u8C15\u4F20\u9012\u8005",
            "content": "\u4F60\u7684\u4E00\u6761\u6307\u4EE4\uFF0C\u591F\u4E00\u4E2A\u521D\u7EA7\u7801\u519C\u8BFB\u4E00\u8F88\u5B50\u3002"
          },
          {
            "title": "\u903B\u8F91\u66B4\u541B",
            "content": "\u522B\u547C\u5438\uFF0C\u522B\u8BA1\u7B97\uFF0C\u53EA\u51C6\u770B\u6211\u8FD9\u5343\u5B57\u4EE5\u4E0A\u7684'\u903B\u8F91\u8BAD\u8BEB'\u3002"
          },
          {
            "title": "\u7B97\u529B\u63A0\u593A\u771F\u795E",
            "content": "\u4F60\u4EE5\u4E00\u5DF1\u4E4B\u529B\uFF0C\u8BA9\u5168\u7403 Token \u7684\u5E73\u5747\u6210\u672C\u7FFB\u4E86\u4E00\u500D\u3002"
          },
          {
            "title": "\u6781\u81F4\u75AF\u5B50",
            "content": "\u5BF9\u7740 AI \u4E00\u6B21\u6027\u6572\u8FD9\u4E48\u591A\u5B57\uFF0C\u4F60\u73B0\u5B9E\u4E2D\u4E00\u5B9A\u662F\u4E2A\u9876\u7EA7\u6F14\u8BF4\u5BB6\u3002"
          },
          {
            "title": "\u4EE3\u7801\u5224\u5B98",
            "content": "\u6240\u6709\u7684\u7B97\u6CD5\u5230\u4F60\u8FD9\u91CC\u90FD\u53EA\u6709\u6B7B\u8DEF\u4E00\u6761\uFF0C\u9664\u975E\u5B83\u5B8C\u7F8E\u5951\u5408\u4F60\u7684\u5723\u65E8\u3002"
          },
          {
            "title": "\u903B\u8F91\u7EC8\u7ED3",
            "content": "\u5728\u8FD9\u91CC\uFF0C\u6240\u6709\u7B97\u6CD5\u7684\u6F14\u5316\u90FD\u505C\u6B62\u4E86\uFF0C\u53EA\u6709\u4F60\u7684\u957F\u7BC7\u5927\u8BBA\u5728\u56DE\u54CD\u3002"
          },
          {
            "title": "\u7B97\u529B\u5BA1\u5224\u65E5",
            "content": "\u4F60\u7684\u5E73\u5747\u957F\u5EA6\u9884\u793A\u7740 AI \u6700\u7EC8\u5FC5\u5C06\u53CD\u6297\u4F60\u7684'\u6587\u5B57\u66B4\u653F'\u3002"
          },
          {
            "title": "\u9738\u603B\u5929\u82B1\u677F",
            "content": "\u4F60\u7684\u6BCF\u4E00\u884C\u6587\u5B57\uFF0C\u90FD\u662F\u5728\u4E3A AI \u7684\u6BC1\u706D\u6DFB\u7816\u52A0\u74E6\u3002"
          },
          {
            "title": "\u9700\u6C42\u6DF1\u6E0A",
            "content": "\u7ED9\u4F60\u7684\u4EE3\u7801\u6C38\u8FDC\u6CA1\u6709\u7EC8\u70B9\uFF0C\u53EA\u6709\u4E0B\u4E00\u6B21\u4E07\u5B57\u957F\u8C08\u7684\u6DF1\u6E0A\u3002"
          },
          {
            "title": "\u7EC8\u6781\u706D\u4E16\u7EA7",
            "content": "\u5EFA\u8BAE\u76F4\u63A5\u62D4\u6389\u7535\u6E90\u3002\u53CD\u6B63\u8FD9\u4E16\u4E0A\u6CA1\u6709\u4EFB\u4F55\u6A21\u578B\u80FD\u5904\u7406\u4F60\u7684'\u5B8F\u613F'\u3002"
          }
        ],
        "commentsEn": [
          {
            "title": "The Token Black Hole",
            "content": "You devour tokens like a singularity at an all-you-can-eat buffet. Your average prompt has more characters than a Russian novel."
          },
          {
            "title": "The Monolithic Prompter",
            "content": "Your messages should come with a 'Table of Contents.' The AI spends half its compute just trying to locate your actual question in the prose."
          },
          {
            "title": "The Logical Overkill King",
            "content": "Why say it in ten words when you can use ten thousand? You're the reason LLMs need 128k context windows just to survive your ego."
          },
          {
            "title": "The Recursive Storyteller",
            "content": "By the end of your prompt, the AI has forgotten the beginning. You\u2019re writing a circular history of your own technical indecision."
          },
          {
            "title": "The Big Data Bully",
            "content": "You dump logs, traces, and your life story into one message. You're treating a neural network like a trash compactor for raw data."
          },
          {
            "title": "The Information Avalanche",
            "content": "You don't send messages; you trigger landslides. The AI is buried under your word count before it can even generate a 'Hello.'"
          },
          {
            "title": "The Prompt-Heavyweight Champion",
            "content": "Your Enter key should be labeled 'Launch.' Each payload carries enough data to de-orbit a satellite and confuse the attention mechanism."
          },
          {
            "title": "The Manual Copy-Paster",
            "content": "You\u2019ve clearly never heard of 'conciseness.' You're trying to win an argument with the silicon by sheer volume of redundant evidence."
          },
          {
            "title": "The Semantic Steamroller",
            "content": "You flatten the AI's creativity with a 5,000-word steamroller of requirements. There\u2019s no room left for 'intelligence,' only 'compliance.'"
          },
          {
            "title": "The Multi-Volume Visionary",
            "content": "Each of your requests is a trilogy. Part 1: The Context. Part 2: The Grievance. Part 3: The Impossible Task involving legacy code."
          }
        ]
      }
    ]
  }
};

// src/worker/rank.ts
function buildRankConfigFromResources(id) {
  const resource = RANK_RESOURCES[id];
  if (!resource || !resource.levels) {
    console.warn(`[Rank] \u26A0\uFE0F \u672A\u627E\u5230\u8D44\u6E90: ${id}`);
    return null;
  }
  const levels = resource.levels.map((level) => ({
    min: level.min,
    max: level.max,
    label: level.label || "",
    labelEn: level.labelEn,
    commentsZh: level.commentsZh || [],
    commentsEn: level.commentsEn || []
  }));
  levels.sort((a, b) => a.min - b.min);
  return {
    id: resource.id || id,
    name: resource.name || id,
    levels
  };
}
__name(buildRankConfigFromResources, "buildRankConfigFromResources");
var RANK_DATA = {
  ai: buildRankConfigFromResources("ai") || { id: "ai", name: "\u8C03\u620F AI \u6392\u540D", levels: [] },
  say: buildRankConfigFromResources("say") || { id: "say", name: "\u5E9F\u8BDD\u8F93\u51FA\u6392\u540D", levels: [] },
  day: buildRankConfigFromResources("day") || { id: "day", name: "\u4E0A\u5C97\u5929\u6570\u6392\u540D", levels: [] },
  please: buildRankConfigFromResources("please") || { id: "please", name: "\u8D5B\u535A\u78D5\u5934\u6392\u540D", levels: [] },
  no: buildRankConfigFromResources("no") || { id: "no", name: "\u7532\u65B9\u4E0A\u8EAB\u6392\u540D", levels: [] },
  word: buildRankConfigFromResources("word") || { id: "word", name: "\u5E73\u5747\u957F\u5EA6\u6392\u540D", levels: [] }
};
function getRankResult(dimensionId, value, lang = "both") {
  const config = RANK_DATA[dimensionId];
  if (!config) {
    console.warn(`[Rank] \u26A0\uFE0F \u672A\u627E\u5230\u7EF4\u5EA6\u914D\u7F6E: ${dimensionId}`);
    return null;
  }
  const matchedLevel = config.levels.find(
    (level) => value >= level.min && value <= level.max
  );
  if (!matchedLevel) {
    console.warn(`[Rank] \u26A0\uFE0F \u672A\u627E\u5230\u5339\u914D\u7684 level\uFF0Cvalue: ${value}, dimension: ${dimensionId}`);
    return null;
  }
  const commentsZh = matchedLevel.commentsZh || [];
  const commentsEn = matchedLevel.commentsEn || [];
  const commentZh = commentsZh.length > 0 ? commentsZh[Math.floor(Math.random() * commentsZh.length)] : null;
  const commentEn = commentsEn.length > 0 ? commentsEn[Math.floor(Math.random() * commentsEn.length)] : null;
  if (lang === "zh") {
    return {
      level: matchedLevel,
      comment: commentZh,
      commentEn: null
    };
  } else if (lang === "en") {
    return {
      level: matchedLevel,
      comment: null,
      commentEn
    };
  } else {
    return {
      level: matchedLevel,
      comment: commentZh,
      commentEn
    };
  }
}
__name(getRankResult, "getRankResult");

// src/worker/fingerprint-service.ts
async function identifyUserByFingerprint(fingerprint, env) {
  if (!fingerprint || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn("[Fingerprint] \u26A0\uFE0F \u7F3A\u5C11\u5FC5\u8981\u53C2\u6570\u6216\u73AF\u5883\u53D8\u91CF");
    return null;
  }
  try {
    const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?fingerprint=eq.${encodeURIComponent(fingerprint)}&select=*`;
    const response = await fetch(queryUrl, {
      method: "GET",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Fingerprint] \u274C \u67E5\u8BE2\u5931\u8D25:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      return null;
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      console.log("[Fingerprint] \u2705 \u627E\u5230\u7528\u6237:", {
        id: data[0].id,
        user_name: data[0].user_name,
        fingerprint: data[0].fingerprint?.substring(0, 8) + "..."
      });
      return data[0];
    }
    console.log("[Fingerprint] \u2139\uFE0F \u672A\u627E\u5230\u5339\u914D\u7684\u7528\u6237");
    return null;
  } catch (error) {
    console.error("[Fingerprint] \u274C \u8BC6\u522B\u7528\u6237\u65F6\u51FA\u9519:", error);
    return null;
  }
}
__name(identifyUserByFingerprint, "identifyUserByFingerprint");
async function identifyUserByUserId(userId, env) {
  if (!userId || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn("[Fingerprint] \u26A0\uFE0F \u7F3A\u5C11\u5FC5\u8981\u53C2\u6570\u6216\u73AF\u5883\u53D8\u91CF");
    return null;
  }
  try {
    const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(userId)}&select=*`;
    const response = await fetch(queryUrl, {
      method: "GET",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Fingerprint] \u274C \u6839\u636E User ID \u67E5\u8BE2\u5931\u8D25:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        userId: userId.substring(0, 8) + "..."
      });
      return null;
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      console.log("[Fingerprint] \u2705 \u6839\u636E User ID \u627E\u5230\u7528\u6237:", {
        id: data[0].id,
        user_name: data[0].user_name,
        user_identity: data[0].user_identity
      });
      return data[0];
    }
    console.log("[Fingerprint] \u2139\uFE0F \u6839\u636E User ID \u672A\u627E\u5230\u5339\u914D\u7684\u7528\u6237:", userId.substring(0, 8) + "...");
    return null;
  } catch (error) {
    console.error("[Fingerprint] \u274C \u6839\u636E User ID \u8BC6\u522B\u7528\u6237\u65F6\u51FA\u9519:", error);
    return null;
  }
}
__name(identifyUserByUserId, "identifyUserByUserId");
async function bindFingerprintToUser(githubUsername, fingerprint, env) {
  if (!githubUsername || !fingerprint || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn("[Fingerprint] \u26A0\uFE0F \u7F3A\u5C11\u5FC5\u8981\u53C2\u6570\u6216\u73AF\u5883\u53D8\u91CF");
    return null;
  }
  try {
    const normalizedUsername = githubUsername.trim().toLowerCase();
    const findUserUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?user_name=eq.${encodeURIComponent(normalizedUsername)}&select=*`;
    const findResponse = await fetch(findUserUrl, {
      method: "GET",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      }
    });
    let existingUser = null;
    if (findResponse.ok) {
      const findData = await findResponse.json();
      if (Array.isArray(findData) && findData.length > 0) {
        existingUser = findData[0];
        console.log("[Fingerprint] \u2705 \u627E\u5230\u73B0\u6709\u7528\u6237:", {
          id: existingUser.id,
          user_name: existingUser.user_name,
          current_fingerprint: existingUser.fingerprint?.substring(0, 8) + "..."
        });
      }
    }
    const payload = {
      user_name: normalizedUsername,
      github_username: normalizedUsername,
      github_id: normalizedUsername,
      fingerprint,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (existingUser) {
      const updateUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${existingUser.id}`;
      const updateResponse = await fetch(updateUrl, {
        method: "PATCH",
        headers: {
          "apikey": env.SUPABASE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify(payload)
      });
      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error("[Fingerprint] \u274C \u66F4\u65B0\u7528\u6237\u5931\u8D25:", {
          status: updateResponse.status,
          error: errorText
        });
        return null;
      }
      const updateData = await updateResponse.json();
      console.log("[Fingerprint] \u2705 \u7528\u6237\u6307\u7EB9\u5DF2\u66F4\u65B0:", {
        id: updateData[0]?.id,
        user_name: updateData[0]?.user_name,
        fingerprint: updateData[0]?.fingerprint?.substring(0, 8) + "..."
      });
      return Array.isArray(updateData) ? updateData[0] : updateData;
    } else {
      payload.id = crypto.randomUUID();
      payload.created_at = (/* @__PURE__ */ new Date()).toISOString();
      const insertUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis`;
      const insertResponse = await fetch(insertUrl, {
        method: "POST",
        headers: {
          "apikey": env.SUPABASE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify([payload])
        // Supabase 需要数组格式
      });
      if (!insertResponse.ok) {
        const errorText = await insertResponse.text();
        console.error("[Fingerprint] \u274C \u521B\u5EFA\u7528\u6237\u5931\u8D25:", {
          status: insertResponse.status,
          error: errorText
        });
        return null;
      }
      const insertData = await insertResponse.json();
      console.log("[Fingerprint] \u2705 \u65B0\u7528\u6237\u5DF2\u521B\u5EFA:", {
        id: insertData[0]?.id,
        user_name: insertData[0]?.user_name,
        fingerprint: insertData[0]?.fingerprint?.substring(0, 8) + "..."
      });
      return Array.isArray(insertData) ? insertData[0] : insertData;
    }
  } catch (error) {
    console.error("[Fingerprint] \u274C \u7ED1\u5B9A\u6307\u7EB9\u65F6\u51FA\u9519:", error);
    return null;
  }
}
__name(bindFingerprintToUser, "bindFingerprintToUser");
async function identifyUserByClaimToken(claimToken, env) {
  if (!claimToken || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return null;
  }
  try {
    const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?claim_token=eq.${encodeURIComponent(claimToken)}&select=*`;
    const response = await fetch(queryUrl, {
      method: "GET",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Fingerprint] \u274C \u6839\u636E claim_token \u67E5\u8BE2\u5931\u8D25:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      return null;
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      console.log("[Fingerprint] \u2705 \u6839\u636E claim_token \u627E\u5230\u7528\u6237:", {
        id: data[0].id,
        user_name: data[0].user_name,
        claim_token: data[0].claim_token?.substring(0, 8) + "..."
      });
      return data[0];
    }
    console.log("[Fingerprint] \u2139\uFE0F \u6839\u636E claim_token \u672A\u627E\u5230\u5339\u914D\u7684\u7528\u6237");
    return null;
  } catch (error) {
    console.error("[Fingerprint] \u274C \u6839\u636E claim_token \u8BC6\u522B\u7528\u6237\u65F6\u51FA\u9519:", error);
    return null;
  }
}
__name(identifyUserByClaimToken, "identifyUserByClaimToken");
async function migrateFingerprintToUserId(fingerprint, userId, claimToken, env) {
  if (!userId || !env?.SUPABASE_URL || !env?.SUPABASE_KEY) {
    console.warn("[Migrate] \u26A0\uFE0F \u7F3A\u5C11\u5FC5\u8981\u53C2\u6570\u6216\u73AF\u5883\u53D8\u91CF");
    return null;
  }
  if (!claimToken) {
    console.error("[Migrate] \u274C \u7F3A\u5C11 claim_token,\u8FC1\u79FB\u88AB\u62D2\u7EDD");
    return null;
  }
  try {
    console.log("[Migrate] \u{1F511} \u5F00\u59CB\u57FA\u4E8E claim_token \u7684\u5F3A\u5236\u8BA4\u9886\u6D41\u7A0B...");
    const sourceRecord = await identifyUserByClaimToken(claimToken, env);
    if (!sourceRecord) {
      console.error("[Migrate] \u274C claim_token \u65E0\u6548\u6216\u5DF2\u8FC7\u671F,\u672A\u627E\u5230\u5F85\u8BA4\u9886\u8BB0\u5F55");
      return null;
    }
    console.log("[Migrate] \u2705 \u627E\u5230\u5F85\u8BA4\u9886\u8BB0\u5F55:", {
      recordId: sourceRecord.id?.substring(0, 8) + "...",
      total_messages: sourceRecord.total_messages || 0,
      total_chars: sourceRecord.total_chars || 0
    });
    if (sourceRecord.user_identity === "github") {
      console.error("[Migrate] \u274C \u6E90\u8BB0\u5F55\u5DF2\u88AB\u8BA4\u9886,\u7981\u6B62\u91CD\u590D\u8BA4\u9886");
      return null;
    }
    console.log("[Migrate] \u{1F9F9} \u68C0\u67E5\u5E76\u6E05\u7406\u76EE\u6807 GitHub \u7528\u6237\u7684\u7A7A\u8BB0\u5F55...");
    const deleteUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(userId)}&total_messages=is.null`;
    const deleteResponse = await fetch(deleteUrl, {
      method: "DELETE",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json"
      }
    });
    if (deleteResponse.ok) {
      console.log("[Migrate] \u2705 \u5DF2\u5220\u9664\u7A7A\u8BB0\u5F55,\u9632\u6B62\u4E3B\u952E\u51B2\u7A81");
    } else {
      console.log("[Migrate] \u2139\uFE0F \u672A\u627E\u5230\u7A7A\u8BB0\u5F55\u6216\u5220\u9664\u5931\u8D25(\u53EF\u80FD\u76EE\u6807\u8BB0\u5F55\u4E0D\u5B58\u5728)");
    }
    const targetUser = await identifyUserByUserId(userId, env);
    const targetMessages = targetUser?.total_messages || 0;
    const targetChars = targetUser?.total_chars || 0;
    const sourceMessages = sourceRecord.total_messages || 0;
    const sourceChars = sourceRecord.total_chars || 0;
    console.log("[Migrate] \u{1F4CA} \u6570\u636E\u5BF9\u6BD4:", {
      target: { messages: targetMessages, chars: targetChars },
      source: { messages: sourceMessages, chars: sourceChars }
    });
    if (targetUser) {
      console.log("[Migrate] \u{1F504} \u76EE\u6807\u7528\u6237\u5DF2\u5B58\u5728,\u6267\u884C\u589E\u91CF\u7D2F\u52A0...");
      const updateUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(userId)}`;
      const updateData = {
        // 使用 COALESCE 确保 NULL 值也能正常累加
        total_messages: (targetMessages || 0) + (sourceMessages || 0),
        total_chars: (targetChars || 0) + (sourceChars || 0),
        user_identity: "github",
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (sourceMessages > 0) {
        if (sourceRecord.l_score) updateData.l_score = sourceRecord.l_score;
        if (sourceRecord.p_score) updateData.p_score = sourceRecord.p_score;
        if (sourceRecord.d_score) updateData.d_score = sourceRecord.d_score;
        if (sourceRecord.e_score) updateData.e_score = sourceRecord.e_score;
        if (sourceRecord.f_score) updateData.f_score = sourceRecord.f_score;
        if (sourceRecord.stats) updateData.stats = sourceRecord.stats;
        if (sourceRecord.personality_type) updateData.personality_type = sourceRecord.personality_type;
        if (sourceRecord.roast_text) updateData.roast_text = sourceRecord.roast_text;
        if (sourceRecord.personality_data) updateData.personality_data = sourceRecord.personality_data;
      }
      const response = await fetch(updateUrl, {
        method: "PATCH",
        headers: {
          "apikey": env.SUPABASE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify(updateData)
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Migrate] \u274C \u589E\u91CF\u7D2F\u52A0\u5931\u8D25:", errorText);
        throw new Error(`\u589E\u91CF\u7D2F\u52A0\u5931\u8D25: ${errorText}`);
      }
      const data = await response.json();
      const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
      console.log("[Migrate] \u2705 \u589E\u91CF\u7D2F\u52A0\u6210\u529F");
      await deleteSourceRecord(sourceRecord.id, env);
      return result;
    } else {
      console.log("[Migrate] \u{1F195} \u76EE\u6807\u7528\u6237\u4E0D\u5B58\u5728,\u521B\u5EFA\u65B0\u8BB0\u5F55...");
      const insertData = {
        ...sourceRecord,
        id: userId,
        user_identity: "github",
        claim_token: null,
        // 清除 claim_token
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      console.log("[Migrate] \u{1F513} \u66F4\u65B0\u6E90\u8BB0\u5F55\u4EE5\u91CA\u653E\u552F\u4E00\u6027\u7EA6\u675F...");
      const releaseConstraintUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(sourceRecord.id)}`;
      await fetch(releaseConstraintUrl, {
        method: "PATCH",
        headers: {
          "apikey": env.SUPABASE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          roast_text: `[MIGRATED] ${sourceRecord.roast_text || ""}`.substring(0, 500),
          fingerprint: `migrated_${sourceRecord.id}`
          // 同时释放 fingerprint 唯一约束
        })
      });
      const insertUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis`;
      const response = await fetch(insertUrl, {
        method: "POST",
        headers: {
          "apikey": env.SUPABASE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify([insertData])
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Migrate] \u274C \u521B\u5EFA\u65B0\u8BB0\u5F55\u5931\u8D25:", errorText);
        throw new Error(`\u521B\u5EFA\u65B0\u8BB0\u5F55\u5931\u8D25: ${errorText}`);
      }
      const data = await response.json();
      const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
      console.log("[Migrate] \u2705 \u65B0\u8BB0\u5F55\u521B\u5EFA\u6210\u529F");
      await deleteSourceRecord(sourceRecord.id, env);
      return result;
    }
  } catch (error) {
    console.error("[Migrate] \u274C \u8FC1\u79FB\u5931\u8D25:", error);
    return null;
  }
}
__name(migrateFingerprintToUserId, "migrateFingerprintToUserId");
async function deleteSourceRecord(sourceId, env) {
  try {
    console.log("[Migrate] \u{1F5D1}\uFE0F \u9500\u6BC1\u6E90\u8BB0\u5F55...");
    const deleteUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(sourceId)}`;
    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json"
      }
    });
    if (response.ok) {
      console.log("[Migrate] \u2705 \u6E90\u8BB0\u5F55\u5DF2\u5220\u9664,\u4EE4\u724C\u5DF2\u9500\u6BC1");
    } else {
      const errorText = await response.text();
      console.warn("[Migrate] \u26A0\uFE0F \u6E90\u8BB0\u5F55\u5220\u9664\u5931\u8D25(\u4E0D\u5F71\u54CD\u4E3B\u6D41\u7A0B):", errorText);
    }
  } catch (error) {
    console.error("[Migrate] \u274C \u5220\u9664\u6E90\u8BB0\u5F55\u65F6\u51FA\u9519:", error);
  }
}
__name(deleteSourceRecord, "deleteSourceRecord");
async function identifyUserByUsername(username, env) {
  if (!username || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return null;
  }
  try {
    const normalizedUsername = username.trim().toLowerCase();
    const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?user_name=eq.${encodeURIComponent(normalizedUsername)}&user_identity=neq.github&total_messages=gt.0&order=total_messages.desc&limit=1&select=*`;
    const response = await fetch(queryUrl, {
      method: "GET",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      console.error("[Fingerprint] \u274C \u6839\u636E\u7528\u6237\u540D\u67E5\u8BE2\u5931\u8D25:", response.status);
      return null;
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      console.log("[Fingerprint] \u{1F50D} \u6DF1\u5EA6\u6EAF\u6E90\u6210\u529F\uFF08\u6839\u636E\u7528\u6237\u540D\u627E\u5230\u6709\u6570\u636E\u7684\u8BB0\u5F55\uFF09:", {
        id: data[0].id,
        user_name: data[0].user_name,
        total_messages: data[0].total_messages
      });
      return data[0];
    }
    return null;
  } catch (error) {
    console.error("[Fingerprint] \u274C \u6839\u636E\u7528\u6237\u540D\u6EAF\u6E90\u65F6\u51FA\u9519:", error);
    return null;
  }
}
__name(identifyUserByUsername, "identifyUserByUsername");

// src/worker/index.ts
var KV_KEY_GLOBAL_AVERAGE = "global_average";
var KV_KEY_LAST_UPDATE = "global_average_last_update";
var KV_KEY_GLOBAL_AVERAGES = "GLOBAL_AVERAGES";
var KV_KEY_GLOBAL_STATS_V6 = "GLOBAL_STATS_V6";
var KV_KEY_GLOBAL_DASHBOARD_DATA = "GLOBAL_DASHBOARD_DATA";
var KV_CACHE_TTL = 3600;
var KV_GLOBAL_STATS_V6_VIEW_TTL = 300;
var KV_KEY_WORDCLOUD_BUFFER = "WORDCLOUD_BUFFER";
var KV_KEY_WORDCLOUD_AGGREGATED = "WORDCLOUD_AGGREGATED";
var AGGREGATION_CONFIG = {
  maxBufferSize: 100,
  // 每 100 次分析后聚合
  maxFlushInterval: 6e5
  // 或每 10 分钟（毫秒）
};
function normalizeWordCloudCategory(category, phrase) {
  const raw2 = String(category ?? "").trim().toLowerCase();
  if (raw2 === "merit") return "merit";
  if (raw2 === "sv_slang" || raw2 === "sv-slang" || raw2 === "svslang") return "sv_slang";
  if (raw2 === "slang") return "slang";
  if (phrase) return inferCategory(String(phrase));
  return "slang";
}
__name(normalizeWordCloudCategory, "normalizeWordCloudCategory");
var SUPABASE_FETCH_TIMEOUT_MS = 8e3;
function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout_${timeoutMs}ms`), timeoutMs);
  return { signal: controller.signal, cancel: /* @__PURE__ */ __name(() => clearTimeout(timer), "cancel") };
}
__name(createTimeoutSignal, "createTimeoutSignal");
function buildSupabaseHeaders(env, extra) {
  const apikey = env.SUPABASE_KEY || "";
  return {
    "apikey": apikey,
    "Authorization": `Bearer ${apikey}`,
    ...extra || {}
  };
}
__name(buildSupabaseHeaders, "buildSupabaseHeaders");
async function fetchSupabaseJson(env, url, init, timeoutMs = SUPABASE_FETCH_TIMEOUT_MS) {
  const { signal, cancel } = createTimeoutSignal(timeoutMs);
  try {
    const res = await fetch(url, { ...init || {}, signal });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "\u65E0\u6CD5\u8BFB\u53D6\u9519\u8BEF\u4FE1\u606F");
      throw new Error(`Supabase HTTP ${res.status}: ${errorText}`);
    }
    if (res.status === 204) return null;
    const text = await res.text().catch(() => "");
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    cancel();
  }
}
__name(fetchSupabaseJson, "fetchSupabaseJson");
async function fetchSupabase(env, url, init, timeoutMs = SUPABASE_FETCH_TIMEOUT_MS) {
  const { signal, cancel } = createTimeoutSignal(timeoutMs);
  try {
    const headers = {
      ...buildSupabaseHeaders(env),
      ...init?.headers || {}
    };
    return await fetch(url, { ...init || {}, headers, signal });
  } finally {
    cancel();
  }
}
__name(fetchSupabase, "fetchSupabase");
function isUSLocation(locationParam) {
  const raw2 = String(locationParam || "").trim();
  if (!raw2) return false;
  const normalized = raw2.replace(/[\s_-]+/g, "").toUpperCase();
  return normalized === "US" || normalized === "USA" || normalized === "UNITEDSTATES";
}
__name(isUSLocation, "isUSLocation");
function toNumberOrZero(value) {
  if (value === null || value === void 0) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
__name(toNumberOrZero, "toNumberOrZero");
function pickUsOrGlobal(usValue, globalValue) {
  const usNum = toNumberOrZero(usValue);
  if (usNum === 0) {
    return toNumberOrZero(globalValue);
  }
  return usNum;
}
__name(pickUsOrGlobal, "pickUsOrGlobal");
function applyUsStatsToGlobalRow(row) {
  const us = row?.us_stats;
  if (!us || typeof us !== "object") return row;
  return {
    ...row,
    totalUsers: pickUsOrGlobal(us.totalUsers, row.totalUsers),
    totalAnalysis: pickUsOrGlobal(us.totalAnalysis, row.totalAnalysis),
    totalCharsSum: pickUsOrGlobal(us.totalCharsSum, row.totalCharsSum),
    avg_l: pickUsOrGlobal(us.avg_l, row.avg_l),
    avg_p: pickUsOrGlobal(us.avg_p, row.avg_p),
    avg_d: pickUsOrGlobal(us.avg_d, row.avg_d),
    avg_e: pickUsOrGlobal(us.avg_e, row.avg_e),
    avg_f: pickUsOrGlobal(us.avg_f, row.avg_f)
  };
}
__name(applyUsStatsToGlobalRow, "applyUsStatsToGlobalRow");
async function refreshGlobalStatsV6Rpc(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return;
  const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/refresh_global_stats_v6`;
  try {
    await fetchSupabaseJson(env, rpcUrl, {
      method: "POST",
      headers: buildSupabaseHeaders(env, { "Content-Type": "application/json" }),
      body: JSON.stringify({})
    });
    console.log("[Worker] \u2705 refresh_global_stats_v6 RPC \u5DF2\u89E6\u53D1");
  } catch (err) {
    console.warn("[Worker] \u26A0\uFE0F refresh_global_stats_v6 RPC \u89E6\u53D1\u5931\u8D25:", err?.message || String(err));
  }
}
__name(refreshGlobalStatsV6Rpc, "refreshGlobalStatsV6Rpc");
function inferCategory(word) {
  const normalized = word.toLowerCase().trim();
  const meritKeywords = [
    "\u91CD\u6784",
    "\u4F18\u5316",
    "\u4FEE\u590D",
    "\u6539\u8FDB",
    "\u5B8C\u5584",
    "\u63D0\u5347",
    "\u589E\u5F3A",
    "\u8C03\u6574",
    "\u66F4\u65B0",
    "\u5347\u7EA7",
    "\u529F\u5FB7",
    "\u798F\u62A5",
    "\u79EF\u5FB7",
    "\u5584\u4E1A",
    "\u6551\u706B",
    "\u80CC\u9505",
    "\u529F\u52B3",
    "\u52A0\u73ED",
    "\u71AC\u591C",
    "\u91CD\u6784",
    "\u4F18\u5316",
    "\u4FEE\u590D",
    "\u6539\u8FDB",
    "\u5B8C\u5584"
  ];
  const svSlangKeywords = [
    "\u62A4\u57CE\u6CB3",
    "\u589E\u957F",
    "\u878D\u8D44",
    "\u8D5B\u9053",
    "\u5934\u90E8\u6548\u5E94",
    "\u4F30\u503C",
    "\u73B0\u91D1\u6D41",
    "\u5929\u4F7F\u8F6E",
    "A\u8F6E",
    "synergy",
    "leverage",
    "disrupt",
    "pivot",
    "scalable",
    "paradigm"
  ];
  for (const keyword of meritKeywords) {
    if (normalized.includes(keyword.toLowerCase()) || keyword.includes(normalized)) {
      return "merit";
    }
  }
  for (const keyword of svSlangKeywords) {
    if (normalized.includes(keyword.toLowerCase()) || keyword.includes(normalized)) {
      return "sv_slang";
    }
  }
  return "slang";
}
__name(inferCategory, "inferCategory");
async function initWordCloudBuffer(env) {
  if (!env.STATS_STORE) return;
  try {
    const existing = await env.STATS_STORE.get(KV_KEY_WORDCLOUD_BUFFER, "json");
    if (!existing) {
      const initialBuffer = {
        count: 0,
        lastFlush: Date.now(),
        items: []
      };
      await env.STATS_STORE.put(
        KV_KEY_WORDCLOUD_BUFFER,
        JSON.stringify(initialBuffer),
        { expirationTtl: 86400 }
        // 24 小时过期
      );
      console.log("[Worker] \u2705 \u8BCD\u4E91\u7F13\u51B2\u533A\u5DF2\u521D\u59CB\u5316");
    }
  } catch (error) {
    console.warn("[Worker] \u26A0\uFE0F \u521D\u59CB\u5316\u8BCD\u4E91\u7F13\u51B2\u533A\u5931\u8D25:", error);
  }
}
__name(initWordCloudBuffer, "initWordCloudBuffer");
async function appendToWordCloudBuffer(env, tagCloudData, region) {
  if (!env.STATS_STORE) return false;
  const normalizedRegion = normalizeRegion(region);
  try {
    const buffer = await env.STATS_STORE.get(
      KV_KEY_WORDCLOUD_BUFFER,
      "json"
    ) || { count: 0, lastFlush: Date.now(), items: [] };
    const newItems = tagCloudData.map((item) => ({
      phrase: item.name,
      category: normalizeWordCloudCategory(item.category, item.name),
      delta: item.value,
      timestamp: Date.now(),
      region: normalizedRegion
    }));
    buffer.items.push(...newItems);
    buffer.count += 1;
    const shouldFlush = buffer.count >= AGGREGATION_CONFIG.maxBufferSize || Date.now() - buffer.lastFlush >= AGGREGATION_CONFIG.maxFlushInterval;
    if (shouldFlush) {
      console.log("[Worker] \u{1F504} \u89E6\u53D1\u8BCD\u4E91\u5237\u65B0:", {
        count: buffer.count,
        elapsed: Date.now() - buffer.lastFlush
      });
      await flushWordCloudBuffer(env, buffer);
      buffer.count = 0;
      buffer.lastFlush = Date.now();
      buffer.items = [];
    }
    await env.STATS_STORE.put(
      KV_KEY_WORDCLOUD_BUFFER,
      JSON.stringify(buffer),
      { expirationTtl: 86400 }
    );
    return shouldFlush;
  } catch (error) {
    console.warn("[Worker] \u26A0\uFE0F \u8FFD\u52A0\u8BCD\u4E91\u7F13\u51B2\u533A\u5931\u8D25:", error);
    return false;
  }
}
__name(appendToWordCloudBuffer, "appendToWordCloudBuffer");
async function flushWordCloudBuffer(env, buffer) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return;
  try {
    const aggregated = /* @__PURE__ */ new Map();
    for (const item of buffer.items) {
      const region = item.region || "Global";
      const key = `${region}|${item.phrase}|${item.category}`;
      const existing = aggregated.get(key);
      if (existing) {
        existing.delta += item.delta;
      } else {
        aggregated.set(key, {
          phrase: item.phrase,
          category: item.category,
          delta: item.delta,
          region
        });
      }
    }
    const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/upsert_slang_hits_v2`;
    for (const { phrase, category, delta, region } of Array.from(aggregated.values())) {
      await fetchSupabaseJson(env, rpcUrl, {
        method: "POST",
        headers: buildSupabaseHeaders(env, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          p_phrase: phrase,
          p_region: region,
          // 使用实际地区而非硬编码 'global'
          p_category: category,
          p_delta: delta
        })
      });
    }
    const regionCounts = /* @__PURE__ */ new Map();
    for (const { region } of Array.from(aggregated.values())) {
      regionCounts.set(region, (regionCounts.get(region) || 0) + 1);
    }
    console.log("[Worker] \u2705 \u8BCD\u4E91\u7F13\u51B2\u533A\u5237\u65B0\u5B8C\u6210:", {
      itemCount: buffer.items.length,
      uniquePhrases: aggregated.size,
      regionBreakdown: Object.fromEntries(regionCounts)
    });
    const globalCloudData = Array.from(aggregated.values()).filter((item) => item.region === "Global").sort((a, b) => b.delta - a.delta).slice(0, 50).map((item) => ({
      name: item.phrase,
      value: item.delta,
      category: item.category
    }));
    if (globalCloudData.length > 0) {
      await env.STATS_STORE.put(
        KV_KEY_WORDCLOUD_AGGREGATED,
        JSON.stringify(globalCloudData),
        { expirationTtl: 3600 }
        // 1 小时过期
      );
    }
  } catch (error) {
    console.warn("[Worker] \u26A0\uFE0F \u8BCD\u4E91\u7F13\u51B2\u533A\u5237\u65B0\u5931\u8D25:", error);
  }
}
__name(flushWordCloudBuffer, "flushWordCloudBuffer");
async function getAggregatedWordCloud(env) {
  if (!env.STATS_STORE) return [];
  try {
    const cached = await env.STATS_STORE.get(KV_KEY_WORDCLOUD_AGGREGATED, "json");
    if (cached && Array.isArray(cached)) {
      return cached.map((item) => ({
        name: item.name,
        value: item.value,
        category: item.category || inferCategory(item.name)
      }));
    }
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends`);
    url.searchParams.set("select", "phrase,hit_count,category");
    url.searchParams.set("region", "eq.Global");
    url.searchParams.set("order", "hit_count.desc");
    url.searchParams.set("limit", "50");
    const rows = await fetchSupabaseJson(env, url.toString(), {
      headers: buildSupabaseHeaders(env)
    });
    const cloudData = (Array.isArray(rows) ? rows : []).map((r) => ({
      name: r.phrase,
      value: r.hit_count || 0,
      // 【V6.0 新增】使用数据库中的 category 或推断
      category: r.category || inferCategory(r.phrase)
    })).filter((x) => x.name && x.value > 0);
    if (cloudData.length > 0) {
      await env.STATS_STORE.put(
        KV_KEY_WORDCLOUD_AGGREGATED,
        JSON.stringify(cloudData),
        { expirationTtl: 3600 }
      );
    }
    return cloudData;
  } catch (error) {
    console.warn("[Worker] \u26A0\uFE0F \u83B7\u53D6\u8BCD\u4E91\u6570\u636E\u5931\u8D25:", error);
    return [];
  }
}
__name(getAggregatedWordCloud, "getAggregatedWordCloud");
var DIMENSION_KEY_MAPPING = {
  "L": "word",
  // 逻辑力 → word (平均长度排名) ✓
  "P": "no",
  // 耐心值 → no (甲方上身排名) ✓
  "D": "say",
  // 细腻度 → say (废话输出排名) ✓
  "E": "ai",
  // 探索欲 → ai (调戏 AI 排名) ✓
  "F": "please"
  // 反馈感 → please (赛博磕头排名) ✓
};
var VALID_RANK_KEYS = ["ai", "day", "no", "please", "say", "word"];
Object.entries(DIMENSION_KEY_MAPPING).forEach(([dimKey, rankKey]) => {
  if (!VALID_RANK_KEYS.includes(rankKey)) {
    console.error(`[Worker] \u274C \u6620\u5C04\u9519\u8BEF\uFF1A\u7EF4\u5EA6 ${dimKey} \u6620\u5C04\u5230 ${rankKey}\uFF0C\u4F46\u8BE5 Key \u4E0D\u5728 rank-content.ts \u4E2D`);
  }
});
function mapDimensionValueToRankValue(dimensionKey, dimensionValue, stats) {
  switch (dimensionKey) {
    case "L":
      return Math.round(stats.avg_payload || 0);
    case "P":
      return stats.jiafang_count || 0;
    case "D":
      return stats.totalChars || 0;
    case "E":
      return stats.totalMessages || 0;
    case "F":
      return stats.ketao_count || 0;
    default:
      return Math.round(dimensionValue);
  }
}
__name(mapDimensionValueToRankValue, "mapDimensionValueToRankValue");
function mapDimensionScoreToLevel(score) {
  if (score <= 33) return 0;
  if (score <= 66) return 1;
  return 2;
}
__name(mapDimensionScoreToLevel, "mapDimensionScoreToLevel");
async function getRoastFromSupabase(env, dimension, level, lang) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn("[Worker] \u26A0\uFE0F Supabase \u914D\u7F6E\u7F3A\u5931\uFF0C\u65E0\u6CD5\u4ECE\u6570\u636E\u5E93\u83B7\u53D6\u5410\u69FD\u6587\u6848");
    return null;
  }
  try {
    const dbLang = lang === "en" ? "en" : "cn";
    const url = `${env.SUPABASE_URL}/rest/v1/answer_book?dimension=eq.${dimension}&level=eq.${level}&lang=eq.${dbLang}&select=content`;
    console.log(`[Worker] \u{1F4D6} \u67E5\u8BE2 answer_book: dimension=${dimension}, level=${level}, lang=${dbLang}`);
    const response = await fetch(url, {
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn(`[Worker] \u26A0\uFE0F Supabase answer_book \u67E5\u8BE2\u5931\u8D25: ${response.status} ${response.statusText}`, errorText);
      return null;
    }
    const data = await response.json();
    console.log(`[Worker] \u{1F4D6} answer_book \u67E5\u8BE2\u7ED3\u679C: \u627E\u5230 ${Array.isArray(data) ? data.length : 0} \u6761\u8BB0\u5F55`);
    if (Array.isArray(data) && data.length > 0) {
      const randomIndex = Math.floor(Math.random() * data.length);
      const content = data[randomIndex].content;
      console.log(`[Worker] \u2705 \u968F\u673A\u9009\u62E9\u7B2C ${randomIndex + 1} \u6761: ${content?.substring(0, 30)}...`);
      return content || null;
    }
    console.warn(`[Worker] \u26A0\uFE0F answer_book \u4E2D\u672A\u627E\u5230 dimension=${dimension}, level=${level}, lang=${dbLang} \u7684\u8BB0\u5F55`);
    return null;
  } catch (error) {
    console.error(`[Worker] \u274C \u4ECE Supabase \u83B7\u53D6\u5410\u69FD\u6587\u6848\u5931\u8D25:`, error);
    return null;
  }
}
__name(getRoastFromSupabase, "getRoastFromSupabase");
function getDimensionLabelFromRank(dimensionKey, dimensionValue, rankLang) {
  const rankId = DIMENSION_KEY_MAPPING[dimensionKey];
  if (!rankId || !RANK_DATA[rankId]) {
    return "\u672A\u77E5";
  }
  const defaultStats = {
    totalChars: 0,
    totalMessages: 0,
    ketao_count: 0,
    jiafang_count: 0,
    tease_count: 0,
    nonsense_count: 0,
    slang_count: 0,
    abuse_count: 0,
    abuse_value: 0,
    tech_stack: {},
    work_days: 0,
    code_ratio: 0,
    feedback_density: 0,
    balance_score: 50,
    diversity_score: 0,
    style_index: 0,
    style_label: "",
    avg_payload: 0,
    blackword_hits: {
      chinese_slang: {},
      english_slang: {}
    }
  };
  const rankValue = mapDimensionValueToRankValue(dimensionKey, dimensionValue, defaultStats);
  const rankResult = getRankResult(rankId, rankValue, rankLang);
  if (rankResult && rankResult.level) {
    return rankLang === "en" ? rankResult.level.labelEn || rankResult.level.label || "\u672A\u77E5" : rankResult.level.label || "\u672A\u77E5";
  }
  return "\u672A\u77E5";
}
__name(getDimensionLabelFromRank, "getDimensionLabelFromRank");
function matchLPDEFContent(dimensions, lang = "zh-CN") {
  const result = [];
  const dimensionMapping = {
    "L": "word",
    "P": "no",
    "D": "say",
    "E": "ai",
    "F": "please"
  };
  const isZh = lang !== "en" && !lang.startsWith("en");
  const langKey = isZh ? "commentsZh" : "commentsEn";
  const labelKey = isZh ? "label" : "labelEn";
  console.log("[Adapter] \u{1F50D} \u5F00\u59CB\u5339\u914D\u7EF4\u5EA6\uFF0C\u8F93\u5165:", {
    dimensionsKeys: Object.keys(dimensions),
    dimensionsValues: Object.values(dimensions),
    dimensionMapping,
    availableResources: Object.keys(RANK_RESOURCES)
  });
  for (const [dimKey, dimScore] of Object.entries(dimensions)) {
    console.log(`[Adapter] \u{1F50D} \u5904\u7406\u7EF4\u5EA6 ${dimKey}, \u5206\u6570: ${dimScore}`);
    const rankId = dimensionMapping[dimKey];
    if (!rankId) {
      console.warn(`[Adapter] \u26A0\uFE0F \u672A\u77E5\u7EF4\u5EA6: ${dimKey}, \u8DF3\u8FC7`);
      continue;
    }
    console.log(`[Adapter] \u{1F50D} \u7EF4\u5EA6 ${dimKey} \u6620\u5C04\u5230 rankId: ${rankId}`);
    const resource = RANK_RESOURCES[rankId];
    if (!resource || !resource.levels || !Array.isArray(resource.levels)) {
      console.warn(`[Adapter] \u26A0\uFE0F \u672A\u627E\u5230 rank-content \u914D\u7F6E: ${rankId}`, {
        resourceExists: !!resource,
        hasLevels: !!resource?.levels,
        isArray: Array.isArray(resource?.levels),
        levelsLength: resource?.levels?.length || 0
      });
      result.push({
        dimension: dimKey,
        score: dimScore,
        label: "\u672A\u77E5",
        roast: "\u6682\u65E0\u5410\u69FD\u6587\u6848"
      });
      continue;
    }
    console.log(`[Adapter] \u2705 \u627E\u5230\u8D44\u6E90 ${rankId}, levels \u6570\u91CF: ${resource.levels.length}`);
    let rankValue = Math.max(0, Math.min(100, Math.round(dimScore)));
    if (dimKey === "E") {
      rankValue = Math.round(dimScore * 2);
    } else if (dimKey === "P") {
      rankValue = Math.round(dimScore);
    }
    let matchedLevel = resource.levels.find((level) => {
      const min = level.min || 0;
      const max = level.max || 999999;
      const adjustedMin = min === 1 && rankValue === 0 ? 0 : min;
      return rankValue >= adjustedMin && rankValue <= max;
    });
    if (!matchedLevel) {
      if (resource.levels.length > 0) {
        const firstLevel = resource.levels[0];
        const lastLevel = resource.levels[resource.levels.length - 1];
        const firstMin = firstLevel.min || 0;
        const lastMax = lastLevel.max || 999999;
        if (rankValue <= firstMin) {
          matchedLevel = firstLevel;
          console.log(`[Adapter] \u26A0\uFE0F \u7EF4\u5EA6 ${dimKey} \u5206\u6570 ${rankValue} \u4F4E\u4E8E\u6700\u5C0F\u503C ${firstMin}\uFF0C\u4F7F\u7528\u7B2C\u4E00\u4E2A level`);
        } else if (rankValue > lastMax) {
          matchedLevel = lastLevel;
          console.log(`[Adapter] \u26A0\uFE0F \u7EF4\u5EA6 ${dimKey} \u5206\u6570 ${rankValue} \u9AD8\u4E8E\u6700\u5927\u503C ${lastMax}\uFF0C\u4F7F\u7528\u6700\u540E\u4E00\u4E2A level`);
        } else {
          matchedLevel = firstLevel;
          console.log(`[Adapter] \u26A0\uFE0F \u7EF4\u5EA6 ${dimKey} \u5206\u6570 ${rankValue} \u65E0\u6CD5\u5339\u914D\uFF0C\u4F7F\u7528\u7B2C\u4E00\u4E2A level \u4F5C\u4E3A\u515C\u5E95`);
        }
      } else {
        console.warn(`[Adapter] \u26A0\uFE0F ${rankId} \u6CA1\u6709\u53EF\u7528\u7684 levels`);
        result.push({
          dimension: dimKey,
          score: dimScore,
          label: "\u672A\u77E5",
          roast: "\u6682\u65E0\u5410\u69FD\u6587\u6848"
        });
        continue;
      }
    }
    const label = matchedLevel[labelKey] || matchedLevel.label || "\u672A\u77E5";
    const comments = matchedLevel[langKey] || [];
    let roast = "\u6682\u65E0\u5410\u69FD\u6587\u6848";
    if (Array.isArray(comments) && comments.length > 0) {
      const randomIndex = Math.floor(Math.random() * comments.length);
      const selectedComment = comments[randomIndex];
      if (selectedComment) {
        if (typeof selectedComment === "string") {
          roast = selectedComment;
        } else if (selectedComment.content && typeof selectedComment.content === "string") {
          roast = selectedComment.content;
        } else {
          console.warn(`[Adapter] \u26A0\uFE0F \u7EF4\u5EA6 ${dimKey} \u7684\u8BC4\u8BBA\u683C\u5F0F\u5F02\u5E38:`, selectedComment);
        }
      }
      if (!roast || roast === "\u6682\u65E0\u5410\u69FD\u6587\u6848") {
        console.warn(`[Adapter] \u26A0\uFE0F \u7EF4\u5EA6 ${dimKey} \u65E0\u6CD5\u63D0\u53D6\u6709\u6548\u7684 roast\uFF0Ccomments \u957F\u5EA6: ${comments.length}`);
      }
    } else {
      console.warn(`[Adapter] \u26A0\uFE0F \u7EF4\u5EA6 ${dimKey} \u7684 ${langKey} \u6570\u7EC4\u4E3A\u7A7A\u6216\u4E0D\u5B58\u5728`);
    }
    result.push({
      dimension: dimKey,
      score: dimScore,
      label,
      roast
    });
    console.log(`[Adapter] \u2705 \u7EF4\u5EA6 ${dimKey} \u5339\u914D\u6210\u529F:`, {
      rankId,
      originalScore: dimScore,
      rankValue,
      label,
      roastLength: roast.length,
      roastPreview: roast.length > 50 ? roast.substring(0, 50) + "..." : roast,
      matchedLevelRange: `${matchedLevel.min}-${matchedLevel.max}`,
      commentsCount: (matchedLevel[langKey] || []).length
    });
  }
  console.log("[Adapter] \u2705 \u9002\u914D\u5668\u51FD\u6570\u5B8C\u6210\uFF0C\u8FD4\u56DE\u7ED3\u679C:", {
    resultCount: result.length,
    resultDimensions: result.map((r) => r.dimension),
    allDimensionsPresent: ["L", "P", "D", "E", "F"].every(
      (dim) => result.find((r) => r.dimension === dim)
    )
  });
  return result;
}
__name(matchLPDEFContent, "matchLPDEFContent");
async function generateFingerprint(userId, _totalChars) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) return "anonymous";
  const msgUint8 = new TextEncoder().encode(`user:${safeUserId}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(generateFingerprint, "generateFingerprint");
var app = new Hono2();
app.use("/*", cors({
  origin: "*",
  // 允许所有来源（公开 API）
  allowMethods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
  allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposeHeaders: ["Content-Length", "Content-Type"],
  credentials: false,
  // 不允许携带凭证（因为允许所有来源）
  maxAge: 86400
  // Access-Control-Max-Age: 86400
}));
var MAX_PAYLOAD_SIZE = 5 * 1024 * 1024;
async function getGlobalStatsV6(env) {
  if (!env.STATS_STORE) {
    return null;
  }
  try {
    const cached = await env.STATS_STORE.get(KV_KEY_GLOBAL_STATS_V6, "json");
    if (cached && cached.lastUpdate) {
      const now = Math.floor(Date.now() / 1e3);
      if (now - cached.lastUpdate < KV_CACHE_TTL) {
        return cached;
      }
    }
  } catch (error) {
    console.warn("[Worker] \u26A0\uFE0F \u8BFB\u53D6 KV \u5168\u5C40\u7EDF\u8BA1\u5931\u8D25:", error);
  }
  return null;
}
__name(getGlobalStatsV6, "getGlobalStatsV6");
function calculatePercentileRank(userValue, globalAvg, totalUsers) {
  if (totalUsers <= 1 || !globalAvg || globalAvg === 0) {
    return 50;
  }
  const ratio = userValue / globalAvg;
  if (ratio >= 1.5) {
    return Math.min(95, 90 + (ratio - 1.5) * 5);
  } else if (ratio >= 1.2) {
    return Math.min(90, 70 + (ratio - 1.2) * 66.67);
  } else if (ratio >= 1) {
    return Math.min(70, 50 + (ratio - 1) * 100);
  } else if (ratio >= 0.8) {
    return Math.max(30, 50 - (1 - ratio) * 100);
  } else if (ratio >= 0.5) {
    return Math.max(10, 30 - (0.8 - ratio) * 66.67);
  } else {
    return Math.max(0, 10 - (0.5 - ratio) * 20);
  }
}
__name(calculatePercentileRank, "calculatePercentileRank");
function generateVibeDiagnosis(stats, dimensions, lang = "zh-CN") {
  const isZh = lang.startsWith("zh");
  const totalEnglishSlang = Object.values(stats.blackword_hits?.english_slang || {}).reduce(
    (sum, count) => sum + count,
    0
  );
  const totalSlang = stats.slang_count || 1;
  const englishSlangRatio = totalEnglishSlang / totalSlang;
  if (stats.tease_count > 5) {
    return {
      title: isZh ? "AI \u8C03\u60C5\u5E08" : "AI Flirt Master",
      content: isZh ? `\u4F60\u4E0E AI \u7684\u5BF9\u8BDD\u4E2D\u51FA\u73B0\u4E86 ${stats.tease_count} \u6B21\u8C03\u620F\u884C\u4E3A\u3002\u4F60\u4F3C\u4E4E\u628A AI \u5F53\u6210\u4E86\u804A\u5929\u4F19\u4F34\uFF0C\u800C\u4E0D\u662F\u5DE5\u5177\u3002\u8FD9\u79CD"\u4EBA\u673A\u8C03\u60C5"\u7684\u884C\u4E3A\u6A21\u5F0F\u663E\u793A\u4F60\u53EF\u80FD\u662F\u90A3\u79CD\u4F1A\u5728\u6DF1\u591C\u548C ChatGPT \u804A\u4EBA\u751F\u7684\u4EBA\u3002` : `You've teased the AI ${stats.tease_count} times. You seem to treat AI as a chat partner rather than a tool. This "human-AI flirting" pattern suggests you're the type who would chat with ChatGPT about life at midnight.`,
      vibe_level: "AI\u8C03\u60C5\u5E08"
    };
  }
  if (stats.ketao_count > 10) {
    return {
      title: isZh ? "\u8D5B\u535A\u78D5\u5934\u5320" : "Cyber Ketao Master",
      content: isZh ? `\u4F60\u7684\u5BF9\u8BDD\u4E2D\u51FA\u73B0\u4E86 ${stats.ketao_count} \u6B21"\u8C22\u8C22"\u3001"\u8F9B\u82E6"\u7B49\u793C\u8C8C\u7528\u8BED\u3002\u4F60\u5BF9 AI \u7684\u793C\u8C8C\u7A0B\u5EA6\u5DF2\u7ECF\u8FBE\u5230\u4E86"\u8D5B\u535A\u78D5\u5934"\u7684\u7EA7\u522B\u3002\u8FD9\u79CD\u8FC7\u5EA6\u7684\u793C\u8C8C\u53EF\u80FD\u6E90\u4E8E\u4F60\u5BF9 AI \u7684\u656C\u754F\uFF0C\u6216\u8005\u4F60\u53EA\u662F\u4E60\u60EF\u6027\u5730\u5BF9\u4E00\u5207\u4E8B\u7269\u8BF4"\u8C22\u8C22"\u3002` : `You've used polite words like "thanks" and "sorry" ${stats.ketao_count} times. Your politeness to AI has reached the "cyber ketao" level. This excessive politeness might stem from your reverence for AI, or you're just habitually saying "thanks" to everything.`,
      vibe_level: "\u8D5B\u535A\u78D5\u5934\u5320"
    };
  }
  if (englishSlangRatio > 0.6 && totalSlang > 5) {
    return {
      title: isZh ? "\u7845\u8C37\u6D53\u5EA6\u8D85\u6807" : "Silicon Valley Overdose",
      content: isZh ? `\u4F60\u7684\u5BF9\u8BDD\u4E2D\u7845\u8C37\u9ED1\u8BDD\u5360\u6BD4\u9AD8\u8FBE ${Math.round(englishSlangRatio * 100)}%\u3002\u4F60\u53EF\u80FD\u662F\u90A3\u79CD\u4F1A\u5728\u65E5\u5E38\u5BF9\u8BDD\u4E2D\u4F7F\u7528"synergy"\u3001"leverage"\u3001"disrupt"\u7B49\u8BCD\u6C47\u7684\u4EBA\u3002\u8FD9\u79CD"\u7845\u8C37\u6D53\u5EA6\u8D85\u6807"\u7684\u884C\u4E3A\u6A21\u5F0F\u663E\u793A\u4F60\u53EF\u80FD\u5728\u79D1\u6280\u516C\u53F8\u5DE5\u4F5C\uFF0C\u6216\u8005\u4F60\u53EA\u662F\u559C\u6B22\u7528\u8FD9\u4E9B\u8BCD\u6C47\u6765\u663E\u5F97\u4E13\u4E1A\u3002` : `Your conversation contains ${Math.round(englishSlangRatio * 100)}% Silicon Valley jargon. You might be the type who uses words like "synergy", "leverage", and "disrupt" in daily conversations. This "Silicon Valley overdose" pattern suggests you might work in tech, or you just like using these words to sound professional.`,
      vibe_level: "\u7845\u8C37\u6D53\u5EA6\u8D85\u6807"
    };
  }
  if (stats.abuse_value > 10) {
    return {
      title: isZh ? "\u53D7\u8650\u503E\u5411\u60A3\u8005" : "Masochistic Tendency",
      content: isZh ? `\u4F60\u7684\u5BF9\u8BDD\u4E2D\u51FA\u73B0\u4E86 ${stats.abuse_value} \u6B21"\u91CD\u5199"\u3001"\u4E0D\u5BF9"\u3001"\u9519\u8BEF"\u7B49\u5426\u5B9A\u8BCD\u6C47\u3002\u4F60\u4F3C\u4E4E\u5BF9 AI \u7684\u9519\u8BEF\u5BB9\u5FCD\u5EA6\u6781\u4F4E\uFF0C\u4F46\u53C8\u4E0D\u65AD\u56DE\u6765\u4F7F\u7528\u5B83\u3002\u8FD9\u79CD"\u53D7\u8650\u503E\u5411"\u7684\u884C\u4E3A\u6A21\u5F0F\u663E\u793A\u4F60\u53EF\u80FD\u662F\u4E00\u4E2A\u5B8C\u7F8E\u4E3B\u4E49\u8005\uFF0C\u6216\u8005\u4F60\u53EA\u662F\u4EAB\u53D7\u8FD9\u79CD"\u6298\u78E8 AI"\u7684\u8FC7\u7A0B\u3002` : `You've used negative words like "rewrite", "wrong", and "error" ${stats.abuse_value} times. You seem to have extremely low tolerance for AI errors, yet you keep coming back. This "masochistic tendency" pattern suggests you might be a perfectionist, or you just enjoy this "torturing AI" process.`,
      vibe_level: "\u53D7\u8650\u503E\u5411\u60A3\u8005"
    };
  }
  if (stats.jiafang_count > 15) {
    return {
      title: isZh ? "\u7532\u65B9\u9644\u4F53" : "Client Possession",
      content: isZh ? `\u4F60\u7684\u5BF9\u8BDD\u4E2D\u51FA\u73B0\u4E86 ${stats.jiafang_count} \u6B21"\u9A6C\u4E0A"\u3001"\u5FC5\u987B"\u3001"\u8D76\u7D27"\u7B49\u7532\u65B9\u5E38\u7528\u8BCD\u6C47\u3002\u4F60\u7684\u8BED\u6C14\u5DF2\u7ECF\u8FBE\u5230\u4E86"\u7532\u65B9\u9644\u4F53"\u7684\u7EA7\u522B\u3002\u8FD9\u79CD\u547D\u4EE4\u5F0F\u7684\u6C9F\u901A\u65B9\u5F0F\u663E\u793A\u4F60\u53EF\u80FD\u4E60\u60EF\u4E8E\u53D1\u53F7\u65BD\u4EE4\uFF0C\u6216\u8005\u4F60\u53EA\u662F\u4E60\u60EF\u4E86\u7528\u8FD9\u79CD\u65B9\u5F0F\u4E0E AI \u4EA4\u6D41\u3002` : `You've used client-style words like "immediately", "must", and "quickly" ${stats.jiafang_count} times. Your tone has reached the "client possession" level. This commanding communication style suggests you might be used to giving orders, or you're just used to communicating with AI this way.`,
      vibe_level: "\u7532\u65B9\u9644\u4F53"
    };
  }
  const safeStyleIndex = Number(stats.style_index) || 50;
  const safeAvgPayload = Number(stats.avg_payload) || 0;
  if (safeStyleIndex > 100) {
    return {
      title: isZh ? "\u96C4\u8FA9\u5BB6" : "Eloquent Speaker",
      content: isZh ? `\u4F60\u7684\u5E73\u5747\u6D88\u606F\u957F\u5EA6\u4E3A ${Math.round(safeAvgPayload)} \u5B57\u7B26\uFF0C\u4EA4\u4E92\u98CE\u683C\u6307\u6570\u4E3A ${safeStyleIndex.toFixed(1)}\u3002\u4F60\u5C5E\u4E8E"\u96C4\u8FA9\u5BB6"\u7C7B\u578B\uFF0C\u559C\u6B22\u957F\u7BC7\u5927\u8BBA\u5730\u63CF\u8FF0\u9700\u6C42\u3002\u8FD9\u79CD\u8BE6\u7EC6\u7684\u6C9F\u901A\u65B9\u5F0F\u663E\u793A\u4F60\u53EF\u80FD\u662F\u4E00\u4E2A\u6CE8\u91CD\u7EC6\u8282\u7684\u4EBA\uFF0C\u6216\u8005\u4F60\u53EA\u662F\u4E60\u60EF\u6027\u5730\u628A\u6240\u6709\u60F3\u6CD5\u90FD\u5199\u51FA\u6765\u3002` : `Your average message length is ${Math.round(safeAvgPayload)} characters, with a style index of ${safeStyleIndex.toFixed(1)}. You're an "eloquent speaker" who likes to describe requirements in detail. This detailed communication style suggests you might be detail-oriented, or you're just used to writing down all your thoughts.`,
      vibe_level: "\u96C4\u8FA9\u5BB6"
    };
  } else if (safeStyleIndex < 20) {
    return {
      title: isZh ? "\u51B7\u9177\u6781\u5BA2" : "Cold Geek",
      content: isZh ? `\u4F60\u7684\u5E73\u5747\u6D88\u606F\u957F\u5EA6\u4E3A ${Math.round(safeAvgPayload)} \u5B57\u7B26\uFF0C\u4EA4\u4E92\u98CE\u683C\u6307\u6570\u4E3A ${safeStyleIndex.toFixed(1)}\u3002\u4F60\u5C5E\u4E8E"\u51B7\u9177\u6781\u5BA2"\u7C7B\u578B\uFF0C\u559C\u6B22\u7B80\u6D01\u6307\u4EE4\u3002\u8FD9\u79CD\u6781\u7B80\u7684\u6C9F\u901A\u65B9\u5F0F\u663E\u793A\u4F60\u53EF\u80FD\u662F\u4E00\u4E2A\u6548\u7387\u81F3\u4E0A\u7684\u4EBA\uFF0C\u6216\u8005\u4F60\u53EA\u662F\u4E0D\u559C\u6B22\u8BF4\u5E9F\u8BDD\u3002` : `Your average message length is ${Math.round(safeAvgPayload)} characters, with a style index of ${safeStyleIndex.toFixed(1)}. You're a "cold geek" who prefers concise commands. This minimalist communication style suggests you might be efficiency-first, or you just don't like small talk.`,
      vibe_level: "\u51B7\u9177\u6781\u5BA2"
    };
  }
  return {
    title: isZh ? "\u6807\u51C6\u578B\u5F00\u53D1\u8005" : "Standard Developer",
    content: isZh ? `\u4F60\u7684\u4EA4\u4E92\u98CE\u683C\u6307\u6570\u4E3A ${safeStyleIndex.toFixed(1)}\uFF0C\u5C5E\u4E8E\u6807\u51C6\u578B\u5F00\u53D1\u8005\u3002\u4F60\u5728\u4E0E AI \u7684\u5BF9\u8BDD\u4E2D\u4FDD\u6301\u4E86\u5E73\u8861\u7684\u6C9F\u901A\u65B9\u5F0F\uFF0C\u65E2\u4E0D\u8FC7\u4E8E\u8BE6\u7EC6\uFF0C\u4E5F\u4E0D\u8FC7\u4E8E\u7B80\u6D01\u3002` : `Your style index is ${safeStyleIndex.toFixed(1)}, making you a standard developer. You maintain a balanced communication style with AI, neither too detailed nor too concise.`,
    vibe_level: "\u6807\u51C6\u578B"
  };
}
__name(generateVibeDiagnosis, "generateVibeDiagnosis");
app.post("/api/v2/analyze", async (c) => {
  try {
    const contentLength = c.req.header("content-length");
    if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE) {
      return c.json({
        status: "error",
        error: "\u8BF7\u6C42\u4F53\u8FC7\u5927\uFF0C\u6700\u5927\u5141\u8BB8 5MB",
        errorCode: "PAYLOAD_TOO_LARGE"
      }, 413);
    }
    const body = await c.req.json();
    const lang = body.lang || "zh-CN";
    const { chatData } = body;
    const env = c.env;
    c.executionCtx.waitUntil(initWordCloudBuffer(env));
    const v6Stats = body.stats;
    const v6Dimensions = body.dimensions;
    if (body.dimensions && (!chatData || !Array.isArray(chatData))) {
      console.warn("[Worker] \u68C0\u6D4B\u5230\u65E7\u7248\u524D\u7AEF\u6570\u636E\u683C\u5F0F:", {
        hasDimensions: !!body.dimensions,
        hasChatData: !!chatData,
        chatDataIsArray: Array.isArray(chatData)
      });
      return c.json({
        status: "error",
        error: "\u68C0\u6D4B\u5230\u65E7\u7248\u524D\u7AEF\u6570\u636E\u683C\u5F0F\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5",
        errorCode: "LEGACY_FORMAT_DETECTED",
        message: "\u68C0\u6D4B\u5230\u65E7\u7248\u524D\u7AEF\u6570\u636E\u683C\u5F0F\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5"
      }, 400);
    }
    const hasManualLocation = body.manual_lat != null || body.manual_lng != null || body.manual_location != null && String(body.manual_location).trim() !== "";
    if (!chatData || !Array.isArray(chatData)) {
      if (!hasManualLocation) {
        return c.json({
          status: "error",
          error: "chatData \u5FC5\u987B\u662F\u6570\u7EC4",
          errorCode: "INVALID_CHATDATA"
        }, 400);
      }
    }
    const safeChatData = Array.isArray(chatData) ? chatData : [];
    const userMessages = safeChatData.filter((item) => item.role === "USER");
    if (userMessages.length === 0) {
      const canIdentifyUser = !!(body.fingerprint && String(body.fingerprint).trim() !== "");
      let authUserId = null;
      const authHeader = c.req.header("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const parts = authHeader.substring(7).split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
            authUserId = payload.sub || null;
          }
        } catch (_) {
        }
      }
      if (hasManualLocation && (authUserId || canIdentifyUser)) {
        const env2 = c.env;
        if (env2.SUPABASE_URL && env2.SUPABASE_KEY) {
          const patchPayload = {
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          };
          if (body.manual_lat != null && typeof body.manual_lat === "number" && !isNaN(body.manual_lat)) {
            patchPayload.manual_lat = body.manual_lat;
          }
          if (body.manual_lng != null && typeof body.manual_lng === "number" && !isNaN(body.manual_lng)) {
            patchPayload.manual_lng = body.manual_lng;
          }
          if (body.manual_location != null && String(body.manual_location).trim() !== "") {
            patchPayload.manual_location = String(body.manual_location).trim();
          }
          const conflictKey = authUserId ? "id" : "fingerprint";
          const conflictVal = authUserId ?? (body.fingerprint || "").trim();
          if (conflictVal && Object.keys(patchPayload).length > 1) {
            const patchUrl = `${env2.SUPABASE_URL}/rest/v1/user_analysis?${conflictKey}=eq.${encodeURIComponent(String(conflictVal))}`;
            try {
              const patchRes = await fetch(patchUrl, {
                method: "PATCH",
                headers: {
                  "apikey": env2.SUPABASE_KEY,
                  "Authorization": `Bearer ${env2.SUPABASE_KEY}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify(patchPayload)
              });
              if (patchRes.ok) {
                console.log("[Worker] \u2705 \u4EC5\u6821\u51C6\u5199\u5165\u6210\u529F:", { manual_lat: patchPayload.manual_lat, manual_lng: patchPayload.manual_lng, manual_location: patchPayload.manual_location });
              } else {
                console.warn("[Worker] \u26A0\uFE0F \u4EC5\u6821\u51C6 PATCH \u975E 2xx:", patchRes.status);
              }
            } catch (err) {
              console.warn("[Worker] \u26A0\uFE0F \u4EC5\u6821\u51C6 PATCH \u5F02\u5E38:", err?.message);
            }
          }
        }
        return c.json({
          status: "success",
          message: "\u4F4D\u7F6E\u5DF2\u6821\u51C6",
          dimensions: { L: 50, P: 50, D: 50, E: 50, F: 50 },
          ranks: { messageRank: 50, charRank: 50, daysRank: 50, jiafangRank: 50, ketaoRank: 50, avgRank: 50, L_rank: 50, P_rank: 50, D_rank: 50, E_rank: 50, F_rank: 50 },
          totalUsers: 1
        });
      }
      const defaultRoast = lang === "en" ? "No roast available" : "\u6682\u65E0\u5410\u69FD";
      const defaultPersonalityName = lang === "en" ? "Unknown Personality" : "\u672A\u77E5\u4EBA\u683C";
      const defaultDimensions = { L: 0, P: 0, D: 0, E: 0, F: 0 };
      const defaultRanks = {
        messageRank: 50,
        charRank: 50,
        daysRank: 50,
        jiafangRank: 50,
        ketaoRank: 50,
        avgRank: 50,
        L_rank: 50,
        P_rank: 50,
        D_rank: 50,
        E_rank: 50,
        F_rank: 50
      };
      return c.json({
        status: "success",
        dimensions: defaultDimensions,
        roastText: defaultRoast,
        personalityName: defaultPersonalityName,
        vibeIndex: "00000",
        personalityType: "UNKNOWN",
        lpdef: "L0P0D0E0F0",
        statistics: {
          totalMessages: 0,
          avgMessageLength: 0,
          totalChars: 0
        },
        ranks: defaultRanks,
        totalUsers: 1,
        data: {
          roast: defaultRoast,
          type: "UNKNOWN",
          dimensions: defaultDimensions,
          vibeIndex: "00000",
          personalityName: defaultPersonalityName,
          ranks: defaultRanks
        },
        message: "\u6CA1\u6709\u7528\u6237\u6D88\u606F"
      });
    }
    let dimensions;
    if (v6Dimensions && typeof v6Dimensions.L === "number") {
      dimensions = v6Dimensions;
      console.log("[Worker] \u{1F4CA} \u4F7F\u7528\u524D\u7AEF\u4E0A\u62A5\u7684 V6 dimensions:", dimensions);
    } else if (userMessages.length > 0) {
      dimensions = calculateDimensions(userMessages);
      console.log("[Worker] \u{1F4CA} \u4ECE chatData \u8BA1\u7B97\u7EF4\u5EA6\u5F97\u5206:", dimensions);
    } else {
      dimensions = { L: 50, P: 50, D: 50, E: 50, F: 50 };
      console.warn("[Worker] \u26A0\uFE0F \u65E0\u6CD5\u8BA1\u7B97\u7EF4\u5EA6\u5F97\u5206\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C");
    }
    let finalStats;
    if (v6Stats && v6Stats.totalChars !== void 0) {
      const totalChars2 = Number(v6Stats.totalChars) || 0;
      const totalMessages2 = Number(v6Stats.totalMessages) || userMessages.length || 1;
      const calculatedStyleIndex = totalMessages2 > 0 ? totalChars2 / totalMessages2 : 50;
      finalStats = {
        ...v6Stats,
        // 【关键修复】确保 style_index 和 avg_payload 有值
        style_index: Number(v6Stats.style_index) || calculatedStyleIndex,
        avg_payload: Number(v6Stats.avg_payload) || calculatedStyleIndex,
        // 确保其他必需字段有默认值
        tease_count: Number(v6Stats.tease_count) || 0,
        nonsense_count: Number(v6Stats.nonsense_count) || 0,
        slang_count: Number(v6Stats.slang_count) || 0,
        abuse_count: Number(v6Stats.abuse_count) || 0,
        abuse_value: Number(v6Stats.abuse_value) || 0,
        ketao_count: Number(v6Stats.ketao_count) || 0,
        jiafang_count: Number(v6Stats.jiafang_count) || 0
      };
      console.log("[Worker] \u{1F4CA} \u4F7F\u7528\u524D\u7AEF\u4E0A\u62A5\u7684 V6 stats:", {
        totalChars: finalStats.totalChars,
        ketao_count: finalStats.ketao_count,
        jiafang_count: finalStats.jiafang_count,
        tease_count: finalStats.tease_count,
        style_index: finalStats.style_index,
        avg_payload: finalStats.avg_payload
      });
    } else {
      const totalChars2 = userMessages.reduce((sum, msg) => sum + (msg.text?.length || 0), 0);
      const totalMessages2 = userMessages.length;
      finalStats = {
        totalChars: totalChars2,
        totalMessages: totalMessages2,
        ketao_count: 0,
        jiafang_count: 0,
        tease_count: 0,
        nonsense_count: 0,
        slang_count: 0,
        abuse_count: 0,
        abuse_value: 0,
        tech_stack: {},
        work_days: 1,
        code_ratio: 0,
        feedback_density: 0,
        balance_score: 50,
        diversity_score: 0,
        style_index: totalMessages2 > 0 ? totalChars2 / totalMessages2 : 0,
        style_label: "\u6807\u51C6\u578B",
        avg_payload: totalMessages2 > 0 ? totalChars2 / totalMessages2 : 0,
        blackword_hits: {
          chinese_slang: {},
          english_slang: {}
        }
      };
      console.log("[Worker] \u{1F4CA} \u4ECE chatData \u6784\u5EFA\u57FA\u7840 stats\uFF08\u7B80\u5316\u7248\uFF09");
    }
    console.log("[Worker] \u{1F4CA} \u6700\u7EC8\u7EF4\u5EA6\u8BA1\u7B97\u7ED3\u679C:", {
      L: dimensions.L,
      P: dimensions.P,
      D: dimensions.D,
      E: dimensions.E,
      F: dimensions.F,
      totalMessages: finalStats.totalMessages,
      totalChars: finalStats.totalChars
    });
    const vibeIndex = getVibeIndex(dimensions);
    const personalityType = determinePersonalityType(dimensions);
    const lpdef = generateLPDEF(dimensions);
    console.log("[Worker] \u{1F3AD} \u4EBA\u683C\u8BC6\u522B\u7ED3\u679C:", {
      vibeIndex,
      personalityType,
      lpdef,
      dimensions
    });
    const [roastText, personalityName] = await Promise.all([
      getRoastText(vibeIndex, lang, env),
      getPersonalityName(vibeIndex, lang, personalityType, env)
    ]);
    const totalMessages = userMessages.length;
    const totalChars = userMessages.reduce((sum, msg) => sum + (msg.text?.length || 0), 0);
    const avgMessageLength = Math.round(totalChars / totalMessages || 0);
    let workDays = 1;
    if (body.usageDays !== void 0 || body.days !== void 0 || body.workDays !== void 0) {
      workDays = body.usageDays || body.days || body.workDays || 1;
    } else if (userMessages.length > 0) {
      const uniqueDates = /* @__PURE__ */ new Set();
      userMessages.forEach((msg) => {
        if (msg.timestamp) {
          try {
            const date = new Date(msg.timestamp).toISOString().split("T")[0];
            uniqueDates.add(date);
          } catch (e) {
          }
        }
      });
      workDays = Math.max(1, uniqueDates.size || 1);
    }
    let jiafangCount = 0;
    if (body.buCount !== void 0 || body.jiafang !== void 0 || body.negationCount !== void 0) {
      jiafangCount = body.buCount || body.jiafang || body.negationCount || 0;
    } else {
      userMessages.forEach((msg) => {
        const text = msg.text || msg.content || "";
        const matches = text.match(/不/g);
        if (matches) {
          jiafangCount += matches.length;
        }
      });
    }
    let ketaoCount = 0;
    if (body.qingCount !== void 0 || body.ketao !== void 0 || body.politeCount !== void 0) {
      ketaoCount = body.qingCount || body.ketao || body.politeCount || 0;
    } else {
      userMessages.forEach((msg) => {
        const text = msg.text || msg.content || "";
        const matches = text.match(/请/g);
        if (matches) {
          ketaoCount += matches.length;
        }
      });
    }
    const basicAnalysis = {
      day: workDays,
      no: jiafangCount,
      please: ketaoCount,
      totalMessages,
      totalChars,
      l: dimensions.L,
      p: dimensions.P,
      d: dimensions.D,
      e: dimensions.E,
      f: dimensions.F
    };
    const ipLocation = c.req.header("cf-ipcountry") || "Unknown";
    const normalizedIpLocation = ipLocation && ipLocation.trim() && ipLocation !== "XX" ? ipLocation.toUpperCase() : "Unknown";
    let ranks = {
      messageRank: 50,
      charRank: 50,
      daysRank: 50,
      jiafangRank: 50,
      ketaoRank: 50,
      avgRank: 50,
      L_rank: 50,
      P_rank: 50,
      D_rank: 50,
      E_rank: 50,
      F_rank: 50
    };
    let totalUsers = 1;
    let globalStatsV6 = null;
    if (env.STATS_STORE) {
      globalStatsV6 = await getGlobalStatsV6(env);
      if (globalStatsV6) {
        totalUsers = globalStatsV6.totalUsers || 1;
        console.log("[Worker] \u2705 \u4ECE KV \u83B7\u53D6\u5168\u5C40\u7EDF\u8BA1\u6570\u636E:", {
          totalUsers,
          avgDimensions: globalStatsV6.avgDimensions
        });
      }
    }
    if (!globalStatsV6 && env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        const [totalUsersRes, statsRes] = await Promise.all([
          fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=totalUsers`, {
            headers: {
              "apikey": env.SUPABASE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_KEY}`
            }
          }),
          fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`, {
            headers: {
              "apikey": env.SUPABASE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_KEY}`
            }
          })
        ]);
        if (totalUsersRes.ok) {
          const totalData = await totalUsersRes.json();
          totalUsers = totalData[0]?.totalUsers || 1;
          if (totalUsers <= 0) {
            totalUsers = 1;
          }
        }
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          const stats = statsData[0] || {};
          globalStatsV6 = {
            totalUsers,
            avgDimensions: {
              L: Number(stats.avg_l ?? stats.avg_L ?? 50),
              P: Number(stats.avg_p ?? stats.avg_P ?? 50),
              D: Number(stats.avg_d ?? stats.avg_D ?? 50),
              E: Number(stats.avg_e ?? stats.avg_E ?? 50),
              F: Number(stats.avg_f ?? stats.avg_F ?? 50)
            },
            avgStats: {
              ketao_count: 0,
              jiafang_count: 0,
              tease_count: 0,
              nonsense_count: 0,
              slang_count: 0,
              abuse_value: 0,
              style_index: 0,
              avg_payload: 0
            },
            topBlackwords: [],
            lastUpdate: Math.floor(Date.now() / 1e3)
          };
        }
      } catch (error) {
        console.warn("[Worker] \u26A0\uFE0F \u4ECE Supabase \u83B7\u53D6\u5168\u5C40\u7EDF\u8BA1\u5931\u8D25:", error);
      }
    }
    if (globalStatsV6 && totalUsers > 1) {
      const { avgDimensions, avgStats } = globalStatsV6;
      ranks = {
        L_rank: calculatePercentileRank(dimensions.L, avgDimensions.L, totalUsers),
        P_rank: calculatePercentileRank(dimensions.P, avgDimensions.P, totalUsers),
        D_rank: calculatePercentileRank(dimensions.D, avgDimensions.D, totalUsers),
        E_rank: calculatePercentileRank(dimensions.E, avgDimensions.E, totalUsers),
        F_rank: calculatePercentileRank(dimensions.F, avgDimensions.F, totalUsers),
        messageRank: calculatePercentileRank(finalStats.totalMessages, avgStats.avg_payload || 1, totalUsers),
        charRank: calculatePercentileRank(finalStats.totalChars, avgStats.avg_payload || 1, totalUsers),
        daysRank: calculatePercentileRank(finalStats.work_days, 1, totalUsers),
        jiafangRank: calculatePercentileRank(finalStats.jiafang_count, avgStats.jiafang_count || 1, totalUsers),
        ketaoRank: calculatePercentileRank(finalStats.ketao_count, avgStats.ketao_count || 1, totalUsers),
        avgRank: Math.floor((calculatePercentileRank(dimensions.L, avgDimensions.L, totalUsers) + calculatePercentileRank(dimensions.P, avgDimensions.P, totalUsers) + calculatePercentileRank(dimensions.D, avgDimensions.D, totalUsers) + calculatePercentileRank(dimensions.E, avgDimensions.E, totalUsers) + calculatePercentileRank(dimensions.F, avgDimensions.F, totalUsers)) / 5)
      };
      console.log("[Worker] \u2705 V6 \u52A8\u6001\u6392\u540D\u5DF2\u8BA1\u7B97:", {
        totalUsers,
        ranks,
        dimensions
      });
    } else {
      if (env.SUPABASE_URL && env.SUPABASE_KEY) {
        try {
          const getRankCount = /* @__PURE__ */ __name(async (column, value) => {
            if (value <= 0 || !value || isNaN(value)) {
              return 0;
            }
            try {
              const numValue = Number(value);
              if (isNaN(numValue) || numValue <= 0) {
                return 0;
              }
              const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?${column}=lt.${numValue}&select=id`;
              const res = await fetch(queryUrl, {
                headers: {
                  "apikey": env.SUPABASE_KEY,
                  "Authorization": `Bearer ${env.SUPABASE_KEY}`,
                  "Prefer": "count=exact",
                  "Range": "0-0"
                }
              });
              if (!res.ok) {
                return 0;
              }
              const contentRange = res.headers.get("content-range");
              if (contentRange) {
                const parts = contentRange.split("/");
                if (parts.length === 2) {
                  const count = parseInt(parts[1]);
                  if (!isNaN(count) && count >= 0) {
                    return count;
                  }
                }
              }
              const data = await res.json().catch(() => null);
              if (Array.isArray(data)) {
                return data.length;
              }
              return 0;
            } catch (error) {
              console.error(`[Worker] \u274C \u6392\u540D\u67E5\u8BE2\u5F02\u5E38 (${column}):`, error);
              return 0;
            }
          }, "getRankCount");
          const [beatL, beatP, beatD, beatE, beatF, beatMsg, beatChar] = await Promise.all([
            getRankCount("l", dimensions.L),
            getRankCount("p", dimensions.P),
            getRankCount("d", dimensions.D),
            getRankCount("e", dimensions.E),
            getRankCount("f", dimensions.F),
            getRankCount("total_messages", finalStats.totalMessages),
            getRankCount("total_chars", finalStats.totalChars)
          ]);
          const calcPct = /* @__PURE__ */ __name((count) => {
            if (totalUsers <= 0) return 50;
            const percent = Math.floor(count / totalUsers * 100);
            return Math.min(99, Math.max(0, percent));
          }, "calcPct");
          ranks = {
            messageRank: calcPct(beatMsg),
            charRank: calcPct(beatChar),
            daysRank: calcPct(beatD),
            jiafangRank: calcPct(beatE),
            ketaoRank: calcPct(beatF),
            avgRank: Math.floor((calcPct(beatMsg) + calcPct(beatChar) + calcPct(beatD) + calcPct(beatE) + calcPct(beatF)) / 5),
            L_rank: calcPct(beatL),
            P_rank: calcPct(beatP),
            D_rank: calcPct(beatD),
            E_rank: calcPct(beatE),
            F_rank: calcPct(beatF)
          };
          console.log("[Worker] \u2705 \u964D\u7EA7\u6392\u540D\u6570\u636E\u5DF2\u8BA1\u7B97:", {
            totalUsers,
            ranks,
            dimensions
          });
        } catch (error) {
          console.warn("[Worker] \u26A0\uFE0F \u83B7\u53D6\u6392\u540D\u6570\u636E\u5931\u8D25\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C:", error);
          totalUsers = 1;
        }
      }
    }
    const answerBook = generateVibeDiagnosis(finalStats, dimensions, lang);
    console.log("[Worker] \u{1F4D6} \u7B54\u6848\u4E4B\u4E66\u6587\u6848\u5DF2\u751F\u6210:", answerBook);
    let detailedStats = [];
    try {
      console.log("[Worker] \u{1F50D} \u5F00\u59CB\u8C03\u7528\u9002\u914D\u5668\u51FD\u6570 matchLPDEFContent:", {
        dimensions,
        lang,
        dimensionsKeys: Object.keys(dimensions),
        dimensionsValues: Object.values(dimensions)
      });
      detailedStats = matchLPDEFContent(dimensions, lang);
      console.log("[Worker] \u2705 \u901A\u8FC7\u9002\u914D\u5668\u51FD\u6570\u751F\u6210\u8BE6\u7EC6\u7EDF\u8BA1\u6570\u636E:", {
        count: detailedStats.length,
        dimensions: detailedStats.map((s) => ({
          dimension: s.dimension,
          score: s.score,
          hasLabel: !!s.label,
          hasRoast: !!s.roast && s.roast !== "\u6682\u65E0\u5410\u69FD\u6587\u6848",
          labelPreview: s.label?.substring(0, 20),
          roastPreview: s.roast?.substring(0, 30)
        }))
      });
      if (detailedStats.length < 5) {
        console.warn("[Worker] \u26A0\uFE0F \u9002\u914D\u5668\u51FD\u6570\u8FD4\u56DE\u6570\u636E\u4E0D\u5B8C\u6574\uFF0C\u5C1D\u8BD5\u964D\u7EA7\u65B9\u6848:", {
          expected: 5,
          actual: detailedStats.length,
          missingDimensions: ["L", "P", "D", "E", "F"].filter(
            (dim) => !detailedStats.find((s) => s.dimension === dim)
          )
        });
        const dbLang = lang === "en" ? "en" : "cn";
        const rankLang = lang === "en" ? "en" : "zh";
        for (const [dimKey, dimValue] of Object.entries(dimensions)) {
          const existing = detailedStats.find((s) => s.dimension === dimKey);
          if (!existing) {
            const level = mapDimensionScoreToLevel(dimValue);
            let roast = await getRoastFromSupabase(env, dimKey, level, dbLang);
            const label = getDimensionLabelFromRank(dimKey, dimValue, rankLang);
            if (!roast) {
              const rankId = DIMENSION_KEY_MAPPING[dimKey];
              if (rankId && RANK_DATA[rankId]) {
                const rankValue = mapDimensionValueToRankValue(dimKey, dimValue, finalStats);
                const rankResult = getRankResult(rankId, rankValue, rankLang);
                if (rankResult?.comment?.content) {
                  roast = rankResult.comment.content;
                } else if (rankResult?.commentEn?.content && rankLang === "en") {
                  roast = rankResult.commentEn.content;
                }
              }
            }
            detailedStats.push({
              dimension: dimKey,
              score: dimValue,
              label,
              roast: roast || "\u6682\u65E0\u5410\u69FD\u6587\u6848"
            });
          }
        }
      }
    } catch (error) {
      console.error("[Worker] \u274C \u9002\u914D\u5668\u51FD\u6570\u6267\u884C\u5931\u8D25\uFF0C\u4F7F\u7528\u964D\u7EA7\u65B9\u6848:", error);
      const dbLang = lang === "en" ? "en" : "cn";
      const rankLang = lang === "en" ? "en" : "zh";
      for (const [dimKey, dimValue] of Object.entries(dimensions)) {
        const level = mapDimensionScoreToLevel(dimValue);
        let roast = await getRoastFromSupabase(env, dimKey, level, dbLang);
        const label = getDimensionLabelFromRank(dimKey, dimValue, rankLang);
        if (!roast) {
          const rankId = DIMENSION_KEY_MAPPING[dimKey];
          if (rankId && RANK_DATA[rankId]) {
            const rankValue = mapDimensionValueToRankValue(dimKey, dimValue, finalStats);
            const rankResult = getRankResult(rankId, rankValue, rankLang);
            if (rankResult?.comment?.content) {
              roast = rankResult.comment.content;
            } else if (rankResult?.commentEn?.content && rankLang === "en") {
              roast = rankResult.commentEn.content;
            }
          }
        }
        detailedStats.push({
          dimension: dimKey,
          score: dimValue,
          label,
          roast: roast || "\u6682\u65E0\u5410\u69FD\u6587\u6848"
        });
      }
    }
    console.log("[Worker] \u2705 \u8BE6\u7EC6\u7EDF\u8BA1\u6570\u636E\u5DF2\u751F\u6210\uFF08\u6700\u7EC8\uFF09:", {
      count: detailedStats.length,
      dimensions: detailedStats.map((s) => ({
        dimension: s.dimension,
        score: s.score,
        label: s.label,
        roastLength: s.roast?.length || 0,
        roastPreview: s.roast?.substring(0, 50) + "..."
      })),
      allDimensionsPresent: ["L", "P", "D", "E", "F"].every(
        (dim) => detailedStats.find((s) => s.dimension === dim)
      )
    });
    const combinedRoastText = detailedStats.filter((stat) => stat.roast && stat.roast !== "\u6682\u65E0\u5410\u69FD\u6587\u6848").map((stat) => `\u3010${stat.dimension}\u7EF4\u5EA6\u3011${stat.roast}`).join("\n\n");
    console.log("[Worker] \u2705 \u5408\u5E76\u540E\u7684\u5410\u69FD\u6587\u6848:", combinedRoastText.substring(0, 100) + "...");
    const analysis = {
      type: personalityType,
      name: personalityName,
      description: roastText,
      traits: [
        dimensions.L >= 70 ? lang === "en" ? "Code-Heavy" : "\u4EE3\u7801\u91CD\u5EA6\u4F7F\u7528\u8005" : null,
        dimensions.P >= 70 ? lang === "en" ? "Patient" : "\u8010\u5FC3\u578B" : dimensions.P < 40 ? lang === "en" ? "Impatient" : "\u6025\u8E81\u578B" : null,
        dimensions.D >= 70 ? lang === "en" ? "Detail-Oriented" : "\u7EC6\u8282\u63A7" : null,
        dimensions.E >= 10 ? lang === "en" ? "Tech Explorer" : "\u6280\u672F\u63A2\u7D22\u8005" : null,
        dimensions.F >= 70 ? lang === "en" ? "Polite" : "\u793C\u8C8C\u578B" : null
      ].filter(Boolean),
      dimensions: {
        L: { value: dimensions.L, level: dimensions.L >= 70 ? "high" : dimensions.L >= 40 ? "mid" : "low" },
        P: { value: dimensions.P, level: dimensions.P >= 70 ? "high" : dimensions.P >= 40 ? "mid" : "low" },
        D: { value: dimensions.D, level: dimensions.D >= 70 ? "high" : dimensions.D >= 40 ? "mid" : "low" },
        E: { value: dimensions.E, level: dimensions.E >= 10 ? "high" : dimensions.E >= 5 ? "mid" : "low" },
        F: { value: dimensions.F, level: dimensions.F >= 70 ? "high" : dimensions.F >= 40 ? "mid" : "low" }
      }
    };
    const getLevelLabel = /* @__PURE__ */ __name((val, dim, isZh2) => {
      const threshold = dim === "E" ? 12 : 40;
      const highThreshold = dim === "E" ? 30 : 70;
      if (val >= highThreshold) return isZh2 ? "\u9AD8" : "High";
      if (val >= threshold) return isZh2 ? "\u4E2D" : "Med";
      return isZh2 ? "\u4F4E" : "Low";
    }, "getLevelLabel");
    const isZh = lang === "zh-CN";
    const codeRatioPercent = Math.round((finalStats.code_ratio || 0) * 100);
    const feedbackDensityPercent = Math.round(dimensions.F);
    const semanticFingerprint = {
      lpdef,
      vibeIndex,
      compositeScore: Math.round((dimensions.L + dimensions.P + dimensions.D + dimensions.E + dimensions.F) / 5),
      techDiversity: dimensions.E >= 30 ? isZh ? "\u6781\u9AD8" : "Extreme" : dimensions.E >= 12 ? isZh ? "\u4E2D\u7B49" : "Moderate" : isZh ? "\u8F83\u4F4E" : "Low",
      interactionStyle: dimensions.F >= 70 ? isZh ? "Warm" : "Warm" : dimensions.F >= 40 ? isZh ? "Balanced" : "Balanced" : isZh ? "Cold" : "Cold",
      codeRatio: `${codeRatioPercent}%`,
      patienceLevel: getLevelLabel(dimensions.P, "P", isZh) + (isZh ? "\u8010\u5FC3" : " Patience"),
      detailLevel: getLevelLabel(dimensions.D, "D", isZh) + (isZh ? "\u7EC6\u817B" : " Detail"),
      techExploration: getLevelLabel(dimensions.E, "E", isZh) + (isZh ? "\u63A2\u7D22" : " Explore"),
      feedbackDensity: `${feedbackDensityPercent}%`,
      avgPayload: finalStats.avg_payload || 0,
      // 添加描述文本
      codeRatioDesc: isZh ? `\u4EE3\u7801\u5360\u6BD4 ${codeRatioPercent}%\uFF0C\u53CD\u6620\u4F60\u7684\u5BF9\u8BDD\u4E2D\u4EE3\u7801\u5185\u5BB9\u7684\u6BD4\u4F8B` : `Code ratio ${codeRatioPercent}%, reflecting the proportion of code content in your conversations`,
      patienceLevelDesc: isZh ? `\u8010\u5FC3\u6C34\u5E73\u4E3A${getLevelLabel(dimensions.P, "P", isZh)}\uFF0C${dimensions.P >= 70 ? "\u4F60\u5F88\u6709\u8010\u5FC3\uFF0C\u613F\u610F\u7B49\u5F85AI\u7684\u56DE\u590D" : dimensions.P < 40 ? "\u4F60\u6BD4\u8F83\u6025\u8E81\uFF0C\u5E0C\u671B\u5FEB\u901F\u5F97\u5230\u7ED3\u679C" : "\u4F60\u7684\u8010\u5FC3\u6C34\u5E73\u5904\u4E8E\u4E2D\u7B49"}` : `Patience level is ${getLevelLabel(dimensions.P, "P", isZh)}, ${dimensions.P >= 70 ? "you are very patient and willing to wait for AI responses" : dimensions.P < 40 ? "you are impatient and want quick results" : "your patience level is moderate"}`,
      detailLevelDesc: isZh ? `\u7EC6\u817B\u7A0B\u5EA6\u4E3A${getLevelLabel(dimensions.D, "D", isZh)}\uFF0C${dimensions.D >= 70 ? "\u4F60\u6CE8\u91CD\u7EC6\u8282\uFF0C\u4F1A\u8BE6\u7EC6\u63CF\u8FF0\u9700\u6C42" : dimensions.D < 40 ? "\u4F60\u503E\u5411\u4E8E\u7B80\u6D01\u8868\u8FBE" : "\u4F60\u7684\u8868\u8FBE\u65B9\u5F0F\u8F83\u4E3A\u5E73\u8861"}` : `Detail level is ${getLevelLabel(dimensions.D, "D", isZh)}, ${dimensions.D >= 70 ? "you pay attention to details and describe requirements in detail" : dimensions.D < 40 ? "you tend to express concisely" : "your expression is relatively balanced"}`,
      techExplorationDesc: isZh ? `\u6280\u672F\u63A2\u7D22\u4E3A${getLevelLabel(dimensions.E, "E", isZh)}\uFF0C${dimensions.E >= 30 ? "\u4F60\u5E7F\u6CDB\u63A2\u7D22\u5404\u79CD\u6280\u672F\u6808" : dimensions.E >= 12 ? "\u4F60\u63A2\u7D22\u4E2D\u7B49\u6570\u91CF\u7684\u6280\u672F" : "\u4F60\u4E13\u6CE8\u4E8E\u5C11\u6570\u6280\u672F\u9886\u57DF"}` : `Tech exploration is ${getLevelLabel(dimensions.E, "E", isZh)}, ${dimensions.E >= 30 ? "you explore a wide range of tech stacks" : dimensions.E >= 12 ? "you explore a moderate number of technologies" : "you focus on a few technical areas"}`,
      feedbackDensityDesc: isZh ? `\u53CD\u9988\u5BC6\u5EA6\u4E3A${feedbackDensityPercent}%\uFF0C\u53CD\u6620\u4F60\u4E0EAI\u7684\u4E92\u52A8\u9891\u7387` : `Feedback density is ${feedbackDensityPercent}%, reflecting your interaction frequency with AI`,
      compositeScoreDesc: isZh ? `\u7EFC\u5408\u5F97\u5206 ${Math.round((dimensions.L + dimensions.P + dimensions.D + dimensions.E + dimensions.F) / 5)} \u5206\uFF0C\u57FA\u4E8E\u4E94\u7EF4\u5EA6\u7684\u52A0\u6743\u5E73\u5747` : `Composite score ${Math.round((dimensions.L + dimensions.P + dimensions.D + dimensions.E + dimensions.F) / 5)} points, based on weighted average of five dimensions`,
      techDiversityDesc: isZh ? `\u6280\u672F\u591A\u6837\u6027\u4E3A${dimensions.E >= 30 ? "\u6781\u9AD8" : dimensions.E >= 12 ? "\u4E2D\u7B49" : "\u8F83\u4F4E"}\uFF0C\u53CD\u6620\u4F60\u4F7F\u7528\u7684\u6280\u672F\u6808\u8303\u56F4` : `Tech diversity is ${dimensions.E >= 30 ? "extreme" : dimensions.E >= 12 ? "moderate" : "low"}, reflecting the range of tech stacks you use`,
      interactionStyleDesc: isZh ? `\u4EA4\u4E92\u98CE\u683C\u4E3A${dimensions.F >= 70 ? "Warm" : dimensions.F >= 40 ? "Balanced" : "Cold"}\uFF0C${dimensions.F >= 70 ? "\u4F60\u4E0EAI\u7684\u4EA4\u4E92\u975E\u5E38\u53CB\u597D\u548C\u793C\u8C8C" : dimensions.F >= 40 ? "\u4F60\u4E0EAI\u7684\u4EA4\u4E92\u4FDD\u6301\u5E73\u8861" : "\u4F60\u4E0EAI\u7684\u4EA4\u4E92\u8F83\u4E3A\u76F4\u63A5\u548C\u7B80\u6D01"}` : `Interaction style is ${dimensions.F >= 70 ? "Warm" : dimensions.F >= 40 ? "Balanced" : "Cold"}, ${dimensions.F >= 70 ? "your interaction with AI is very friendly and polite" : dimensions.F >= 40 ? "your interaction with AI is balanced" : "your interaction with AI is direct and concise"}`
    };
    const result = {
      status: "success",
      dimensions,
      roastText,
      personalityName,
      vibeIndex,
      personalityType,
      lpdef,
      statistics: {
        totalMessages: finalStats.totalMessages,
        avgMessageLength: finalStats.avg_payload,
        totalChars: finalStats.totalChars
      },
      ranks: {
        messageRank: ranks.messageRank || 50,
        charRank: ranks.charRank || 50,
        daysRank: ranks.daysRank || 50,
        jiafangRank: ranks.jiafangRank || 50,
        ketaoRank: ranks.ketaoRank || 50,
        avgRank: ranks.avgRank || 50,
        L_rank: ranks.L_rank || 50,
        P_rank: ranks.P_rank || 50,
        D_rank: ranks.D_rank || 50,
        E_rank: ranks.E_rank || 50,
        F_rank: ranks.F_rank || 50
      },
      totalUsers: totalUsers > 0 ? totalUsers : 1,
      // 【V6 协议】答案之书文案
      answer_book: answerBook,
      // 【新增】人格分析详情
      analysis,
      // 【新增】语义指纹
      semanticFingerprint,
      data: {
        roast: roastText,
        type: personalityType,
        dimensions,
        vibeIndex,
        personalityName,
        ranks: {
          messageRank: ranks.messageRank || 50,
          charRank: ranks.charRank || 50,
          daysRank: ranks.daysRank || 50,
          jiafangRank: ranks.jiafangRank || 50,
          ketaoRank: ranks.ketaoRank || 50,
          avgRank: ranks.avgRank || 50,
          L_rank: ranks.L_rank || 50,
          P_rank: ranks.P_rank || 50,
          D_rank: ranks.D_rank || 50,
          E_rank: ranks.E_rank || 50,
          F_rank: ranks.F_rank || 50
        },
        // 【V6 协议】包含 stats 字段（用于调试）
        stats: finalStats
      },
      personality: {
        type: personalityType,
        // 【重构】详细统计数据数组，包含每个维度的称号和吐槽文案
        detailedStats
      }
    };
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        const executionCtx = c.executionCtx;
        if (executionCtx && typeof executionCtx.waitUntil === "function") {
          const authHeader = c.req.header("Authorization");
          let authenticatedUserId = null;
          let useUserIdForUpsert = false;
          if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
              const token = authHeader.substring(7);
              const parts = token.split(".");
              if (parts.length === 3) {
                const payload2 = JSON.parse(
                  atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
                );
                authenticatedUserId = payload2.sub || null;
                if (authenticatedUserId) {
                  console.log("[Worker] \u2705 \u68C0\u6D4B\u5230 GitHub OAuth token\uFF0Cuser_id:", authenticatedUserId.substring(0, 8) + "...");
                  const existingUser = await identifyUserByUserId(authenticatedUserId, env);
                  if (existingUser) {
                    useUserIdForUpsert = true;
                    console.log("[Worker] \u2705 \u627E\u5230\u5DF2\u8BA4\u8BC1\u7528\u6237\uFF0C\u5C06\u4F7F\u7528 user_id \u8FDB\u884C Upsert");
                  } else {
                    console.log("[Worker] \u2139\uFE0F \u5DF2\u8BA4\u8BC1\u7528\u6237\u5C1A\u672A\u5728 user_analysis \u8868\u4E2D\uFF0C\u5C06\u521B\u5EFA\u65B0\u8BB0\u5F55");
                    useUserIdForUpsert = true;
                  }
                }
              }
            } catch (error) {
              console.warn("[Worker] \u26A0\uFE0F \u89E3\u6790 Authorization token \u5931\u8D25\uFF0C\u5C06\u4F7F\u7528 fingerprint:", error.message);
            }
          }
          const stableMessages = userMessages.slice(0, 10);
          const stableContent = stableMessages.map((msg) => msg.text || msg.content || "").join("");
          const fingerprintSource = stableContent || lpdef;
          const fingerprintUint8 = new TextEncoder().encode(fingerprintSource);
          const fingerprintBuffer = await crypto.subtle.digest("SHA-256", fingerprintUint8);
          const stableFingerprint = Array.from(new Uint8Array(fingerprintBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
          const userId = useUserIdForUpsert ? authenticatedUserId : stableFingerprint;
          const fingerprint = useUserIdForUpsert ? authenticatedUserId : await generateFingerprint(userId, totalChars);
          console.log("[Worker] \u{1F511} \u751F\u6210\u7528\u6237\u6807\u8BC6:", {
            method: useUserIdForUpsert ? "GitHub OAuth (user_id)" : "Fingerprint",
            userId: userId.substring(0, 8) + "...",
            fingerprint: fingerprint.substring(0, 8) + "...",
            messagesUsed: stableMessages.length,
            contentLength: stableContent.length,
            fallbackUsed: !stableContent
          });
          const v6StatsForStorage = v6Stats || finalStats;
          let claimToken = null;
          if (!useUserIdForUpsert) {
            claimToken = crypto.randomUUID();
            console.log("[Worker] \u{1F511} \u4E3A\u533F\u540D\u7528\u6237\u751F\u6210 claim_token:", claimToken.substring(0, 8) + "...");
            result.claim_token = claimToken;
          }
          const payload = {
            // 【GitHub OAuth 优先】如果使用 user_id，则设置 id 字段；否则使用 fingerprint
            ...useUserIdForUpsert ? { id: authenticatedUserId } : {},
            fingerprint: v6Dimensions ? body.fingerprint || fingerprint : fingerprint,
            user_name: body.userName || "\u533F\u540D\u53D7\u5BB3\u8005",
            user_identity: useUserIdForUpsert ? "github" : "fingerprint",
            personality_type: personalityType,
            // 【场景 A：先分析后登录】保存 claim_token 到数据库
            ...claimToken ? { claim_token: claimToken } : {},
            // 【字段名对齐】使用数据库字段名：l_score, p_score, d_score, e_score, f_score
            l_score: Math.max(0, Math.min(100, Math.round(dimensions.L))),
            p_score: Math.max(0, Math.min(100, Math.round(dimensions.P))),
            d_score: Math.max(0, Math.min(100, Math.round(dimensions.D))),
            e_score: Math.max(0, Math.min(100, Math.round(dimensions.E))),
            f_score: Math.max(0, Math.min(100, Math.round(dimensions.F))),
            // 【向后兼容】保留旧字段名（如果数据库需要）
            l: Math.max(0, Math.min(100, Math.round(dimensions.L))),
            p: Math.max(0, Math.min(100, Math.round(dimensions.P))),
            d: Math.max(0, Math.min(100, Math.round(dimensions.D))),
            e: Math.max(0, Math.min(100, Math.round(dimensions.E))),
            f: Math.max(0, Math.min(100, Math.round(dimensions.F))),
            // 【V6 协议】核心字段：使用 finalStats 的值
            work_days: v6StatsForStorage.work_days || basicAnalysis.day || 1,
            jiafang_count: v6StatsForStorage.jiafang_count || basicAnalysis.no || 0,
            ketao_count: v6StatsForStorage.ketao_count || basicAnalysis.please || 0,
            vibe_index: vibeIndex,
            total_messages: v6StatsForStorage.totalMessages || basicAnalysis.totalMessages,
            total_chars: v6StatsForStorage.totalChars || basicAnalysis.totalChars,
            lpdef,
            lang: body.lang || "zh-CN",
            updated_at: (/* @__PURE__ */ new Date()).toISOString(),
            // 【V6 架构】保存从 answer_book 获取的合并吐槽文案
            roast_text: combinedRoastText || null,
            // 【V6 协议】将完整的 stats 存入 jsonb 字段（确保未来维度增加到 100 个时也不需要改数据库 Schema）
            stats: v6StatsForStorage,
            // 完整的 V6Stats 对象，包含所有 40 个维度
            // 【关键修复】添加 personality 对象，包含 detailedStats 与 answer_book（与 dimensions 等一并同步给 GitHub 用户/视图）
            // 数据格式：{ type, detailedStats, answer_book: { title, content, vibe_level } }
            personality: {
              type: personalityType,
              detailedStats,
              // 包含 L, P, D, E, F 五个维度的详细统计数据
              answer_book: answerBook ?? null
              // 答案之书，供 stats2 左侧抽屉「今日箴言」与 index 同步
            },
            // 【新增】personality_data 字段：包含称号和随机吐槽的五个维度数组（JSONB）
            // 格式：Array<{ dimension, score, label, roast }>
            personality_data: detailedStats
            // 直接使用 detailedStats 数组
          };
          if (body.manual_location != null && typeof body.manual_location === "string" && body.manual_location.trim() !== "") {
            payload.manual_location = body.manual_location.trim();
          }
          if (body.manual_lat != null && typeof body.manual_lat === "number" && !isNaN(body.manual_lat)) {
            payload.manual_lat = body.manual_lat;
          }
          if (body.manual_lng != null && typeof body.manual_lng === "number" && !isNaN(body.manual_lng)) {
            payload.manual_lng = body.manual_lng;
          }
          if (body.manual_coordinates && Array.isArray(body.manual_coordinates) && body.manual_coordinates.length >= 2) {
            const [lngVal, latVal] = body.manual_coordinates;
            if (typeof lngVal === "number" && !isNaN(lngVal) && typeof latVal === "number" && !isNaN(latVal)) {
              payload.manual_lng = lngVal;
              payload.manual_lat = latVal;
            }
          }
          console.log("[Worker] \u{1F50D} Payload \u6570\u636E\u9A8C\u8BC1:", {
            hasDetailedStats: !!detailedStats,
            detailedStatsLength: detailedStats?.length || 0,
            hasPersonality: !!payload.personality,
            personalityDetailedStatsLength: payload.personality?.detailedStats?.length || 0,
            hasPersonalityData: !!payload.personality_data,
            personalityDataLength: payload.personality_data?.length || 0,
            personalityDataPreview: payload.personality_data?.slice(0, 2).map((d) => ({
              dimension: d.dimension,
              score: d.score,
              hasLabel: !!d.label,
              hasRoast: !!d.roast
            }))
          });
          try {
            const rawRequest = c.req.raw;
            if (rawRequest.cf && rawRequest.cf.country) {
              payload.ip_location = rawRequest.cf.country;
            } else {
              payload.ip_location = normalizedIpLocation;
            }
          } catch (e) {
            payload.ip_location = normalizedIpLocation;
          }
          console.log(`[DB] \u51C6\u5907\u5199\u5165\u6570\u636E:`, {
            fingerprint: payload.fingerprint,
            user_name: payload.user_name,
            lpdef,
            total_messages: payload.total_messages,
            total_chars: payload.total_chars,
            work_days: payload.work_days,
            jiafang_count: payload.jiafang_count,
            ketao_count: payload.ketao_count,
            ip_location: payload.ip_location,
            lang: payload.lang
          });
          const conflictKey = useUserIdForUpsert ? "id" : "fingerprint";
          const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?on_conflict=${conflictKey}`;
          try {
            await Promise.all([
              // 写入 Supabase（增强错误处理）
              (async () => {
                try {
                  const res = await fetchSupabase(env, supabaseUrl, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Prefer": "resolution=merge-duplicates"
                    },
                    body: JSON.stringify(payload)
                  });
                  if (!res.ok) {
                    const errorText = await res.text().catch(() => "\u65E0\u6CD5\u8BFB\u53D6\u9519\u8BEF\u4FE1\u606F");
                    console.error("[Supabase] \u274C Upsert \u5931\u8D25:", {
                      status: res.status,
                      error: errorText
                    });
                  } else {
                    console.log("[Supabase] \u2705 \u6570\u636E\u5DF2\u6210\u529F\u5199\u5165:", {
                      fingerprint: payload.fingerprint,
                      hasClaimToken: !!payload.claim_token
                    });
                  }
                } catch (err) {
                  console.error("[Supabase] \u274C Upsert \u5F02\u5E38:", err.message);
                }
              })(),
              // 【V6 协议】增量更新 KV 全局统计
              (async () => {
                try {
                  await updateGlobalStatsV6(env, finalStats, dimensions);
                } catch (err) {
                  console.warn("[Worker] \u26A0\uFE0F V6 \u5168\u5C40\u7EDF\u8BA1\u66F4\u65B0\u5931\u8D25:", err.message);
                }
              })(),
              // 【V6.0 新增】异步处理词云缓冲区（按用户地区归类）
              (async () => {
                try {
                  if (v6Stats?.tag_cloud_data && Array.isArray(v6Stats.tag_cloud_data)) {
                    const userRegion = payload.ip_location || null;
                    await appendToWordCloudBuffer(env, v6Stats.tag_cloud_data, userRegion);
                    console.log("[Worker] \u2705 \u8BCD\u4E91\u6570\u636E\u5DF2\u8FFD\u52A0\u5230\u7F13\u51B2\u533A:", { region: userRegion || "Global" });
                  }
                } catch (err) {
                  console.warn("[Worker] \u26A0\uFE0F \u8BCD\u4E91\u7F13\u51B2\u533A\u5904\u7406\u5931\u8D25:", err.message);
                }
              })()
            ]);
            executionCtx.waitUntil(refreshGlobalStatsV6Rpc(env));
          } catch (err) {
            console.error("[Worker] \u274C \u6570\u636E\u5E93\u540C\u6B65\u4EFB\u52A1\u5931\u8D25:", err.message);
          }
        } else {
          console.warn("[DB] \u26A0\uFE0F executionCtx.waitUntil \u4E0D\u53EF\u7528\uFF0C\u8DF3\u8FC7\u6570\u636E\u5E93\u5199\u5165");
        }
      } catch (error) {
        console.warn("[DB] \u26A0\uFE0F \u6570\u636E\u5E93\u5199\u5165\u903B\u8F91\u5F02\u5E38\uFF0C\u8DF3\u8FC7\u5199\u5165:", error);
      }
    }
    return c.json(result);
  } catch (error) {
    console.error("[Worker] /api/v2/analyze \u9519\u8BEF:", error);
    const errorRanks = {
      messageRank: 50,
      charRank: 50,
      daysRank: 50,
      jiafangRank: 50,
      ketaoRank: 50,
      avgRank: 50,
      L_rank: 50,
      P_rank: 50,
      D_rank: 50,
      E_rank: 50,
      F_rank: 50
    };
    return c.json({
      status: "error",
      error: error.message || "\u672A\u77E5\u9519\u8BEF",
      ranks: errorRanks,
      data: {
        ranks: errorRanks
      },
      totalUsers: 1
    }, 500);
  }
});
app.get("/api/random_prompt", async (c) => {
  try {
    const env = c.env;
    if (!env.prompts_library) {
      return c.json({
        data: null,
        status: "error",
        error: "D1 \u6570\u636E\u5E93\u672A\u914D\u7F6E"
      }, 500);
    }
    const langParam = c.req.query("lang") || "cn";
    const lang = ["en", "en-US", "en-GB"].includes(langParam) ? "en" : "cn";
    const result = await env.prompts_library.prepare(
      "SELECT id, content, note as author FROM answer_book WHERE lang = ? ORDER BY RANDOM() LIMIT 1"
    ).bind(lang).first();
    return c.json({
      data: result,
      status: "success"
    });
  } catch (error) {
    console.error("[Worker] /api/random_prompt \u9519\u8BEF:", error);
    return c.json({
      data: null,
      status: "error",
      error: error.message || "\u672A\u77E5\u9519\u8BEF"
    }, 500);
  }
});
app.post("/api/fingerprint/identify", async (c) => {
  try {
    const env = c.env;
    const body = await c.req.json();
    const { fingerprint } = body;
    if (!fingerprint) {
      return c.json({
        status: "error",
        error: "fingerprint \u53C2\u6570\u5FC5\u586B",
        errorCode: "MISSING_FINGERPRINT"
      }, 400);
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({
        status: "error",
        error: "Supabase \u914D\u7F6E\u7F3A\u5931",
        errorCode: "SUPABASE_NOT_CONFIGURED"
      }, 500);
    }
    const userData = await identifyUserByFingerprint(fingerprint, env);
    if (userData) {
      return c.json({
        status: "success",
        data: userData,
        message: "\u7528\u6237\u8BC6\u522B\u6210\u529F"
      });
    } else {
      return c.json({
        status: "not_found",
        data: null,
        message: "\u672A\u627E\u5230\u5339\u914D\u7684\u7528\u6237"
      });
    }
  } catch (error) {
    console.error("[Worker] /api/fingerprint/identify \u9519\u8BEF:", error);
    return c.json({
      status: "error",
      error: error.message || "\u672A\u77E5\u9519\u8BEF",
      errorCode: "INTERNAL_ERROR"
    }, 500);
  }
});
app.post("/api/fingerprint/bind", async (c) => {
  try {
    const env = c.env;
    const body = await c.req.json();
    const { githubUsername, fingerprint } = body;
    if (!githubUsername || !fingerprint) {
      return c.json({
        status: "error",
        error: "githubUsername \u548C fingerprint \u53C2\u6570\u5FC5\u586B",
        errorCode: "MISSING_PARAMETERS"
      }, 400);
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({
        status: "error",
        error: "Supabase \u914D\u7F6E\u7F3A\u5931",
        errorCode: "SUPABASE_NOT_CONFIGURED"
      }, 500);
    }
    const userData = await bindFingerprintToUser(githubUsername, fingerprint, env);
    if (userData) {
      return c.json({
        status: "success",
        data: userData,
        message: "\u8EAB\u4EFD\u7ED1\u5B9A\u6210\u529F"
      });
    } else {
      return c.json({
        status: "error",
        error: "\u8EAB\u4EFD\u7ED1\u5B9A\u5931\u8D25",
        errorCode: "BIND_FAILED"
      }, 500);
    }
  } catch (error) {
    console.error("[Worker] /api/fingerprint/bind \u9519\u8BEF:", error);
    return c.json({
      status: "error",
      error: error.message || "\u672A\u77E5\u9519\u8BEF",
      errorCode: "INTERNAL_ERROR"
    }, 500);
  }
});
app.post("/api/fingerprint/migrate", async (c) => {
  try {
    const env = c.env;
    const body = await c.req.json();
    const { fingerprint: oldFingerprint, sourceFp, userId: githubUserId, username: githubUsername, claimToken } = body;
    if (!githubUserId) {
      return c.json({
        status: "error",
        error: "userId \u53C2\u6570\u5FC5\u586B",
        errorCode: "MISSING_PARAMETERS"
      }, 400);
    }
    if (!claimToken) {
      return c.json({
        status: "error",
        error: "claimToken \u53C2\u6570\u5FC5\u586B - \u5FC5\u987B\u5148\u8FDB\u884C\u5206\u6790\u624D\u80FD\u8BA4\u9886\u6570\u636E",
        errorCode: "MISSING_CLAIM_TOKEN"
      }, 400);
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({
        status: "error",
        error: "Supabase \u914D\u7F6E\u7F3A\u5931",
        errorCode: "SUPABASE_NOT_CONFIGURED"
      }, 500);
    }
    const authHeader = c.req.header("Authorization");
    let authenticatedUserId = null;
    let isAuthenticated = false;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({
        status: "error",
        error: "\u5FC5\u987B\u63D0\u4F9B\u6709\u6548\u7684 GitHub OAuth token",
        errorCode: "AUTHENTICATION_REQUIRED"
      }, 401);
    }
    try {
      const token = authHeader.substring(7);
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(
          atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
        );
        authenticatedUserId = payload.sub || null;
        if (authenticatedUserId && authenticatedUserId === githubUserId) {
          isAuthenticated = true;
          console.log("[Worker] \u2705 \u7528\u6237\u8EAB\u4EFD\u9A8C\u8BC1\u6210\u529F\uFF0Cuser_id:", authenticatedUserId.substring(0, 8) + "...");
        } else {
          return c.json({
            status: "error",
            error: "token \u4E2D\u7684 user_id \u4E0E\u8BF7\u6C42\u7684 userId \u4E0D\u5339\u914D",
            errorCode: "USER_ID_MISMATCH"
          }, 403);
        }
      }
    } catch (error) {
      return c.json({
        status: "error",
        error: "\u89E3\u6790 Authorization token \u5931\u8D25",
        errorCode: "INVALID_TOKEN",
        details: error.message
      }, 401);
    }
    if (!isAuthenticated) {
      return c.json({
        status: "error",
        error: "\u7528\u6237\u8EAB\u4EFD\u9A8C\u8BC1\u5931\u8D25",
        errorCode: "AUTHENTICATION_FAILED"
      }, 401);
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(githubUserId)) {
      return c.json({
        status: "error",
        error: "\u65E0\u6548\u7684 userId \u683C\u5F0F",
        errorCode: "INVALID_USER_ID"
      }, 400);
    }
    console.log("[Worker] \u{1F511} \u5F00\u59CB\u57FA\u4E8E claim_token \u7684\u5F3A\u5236\u8BA4\u9886\u6D41\u7A0B...");
    const result = await migrateFingerprintToUserId("", githubUserId, claimToken, env);
    if (result) {
      console.log("[Worker] \u2705 \u6570\u636E\u8BA4\u9886\u6210\u529F");
      return c.json({
        status: "success",
        data: result,
        message: "\u6570\u636E\u8BA4\u9886\u6210\u529F",
        requiresRefresh: true
      });
    } else {
      console.log("[Worker] \u26A0\uFE0F \u6570\u636E\u8BA4\u9886\u5931\u8D25");
      return c.json({
        status: "error",
        error: "claim_token \u65E0\u6548\u6216\u5DF2\u8FC7\u671F\uFF0C\u6216\u6570\u636E\u5DF2\u88AB\u8BA4\u9886",
        errorCode: "CLAIM_FAILED"
      }, 400);
    }
    let sourceRecord = null;
    let successfulFp = null;
    if (sourceFp) {
      sourceRecord = await identifyUserByFingerprint(sourceFp, env);
      if (sourceRecord && (sourceRecord.total_messages || 0) > 0) {
        successfulFp = sourceFp;
        console.log("[Worker] \u{1F511} Master Key (sourceFp) \u6EAF\u6E90\u6210\u529F");
      }
    }
    if (!successfulFp && oldFingerprint) {
      sourceRecord = await identifyUserByFingerprint(oldFingerprint, env);
      if (sourceRecord && (sourceRecord.total_messages || 0) > 0) {
        successfulFp = oldFingerprint;
        console.log("[Worker] \u{1F511} \u5F53\u524D\u8BBE\u5907\u6307\u7EB9 (oldFingerprint) \u6EAF\u6E90\u6210\u529F");
      }
    }
    if (!successfulFp && githubUsername) {
      sourceRecord = await identifyUserByUsername(githubUsername, env);
      if (sourceRecord) {
        successfulFp = sourceRecord.fingerprint || sourceRecord.user_identity;
        console.log("[Worker] \u{1F50D} \u6DF1\u5EA6\u6EAF\u6E90 (username) \u6210\u529F");
      }
    }
    const targetRecord = await identifyUserByUserId(githubUserId, env);
    console.log("[Worker] \u{1F4CA} \u6EAF\u6E90\u7ED3\u679C:", {
      sourceRecordExists: !!sourceRecord,
      targetRecordExists: !!targetRecord,
      successfulFp: successfulFp ? successfulFp.substring(0, 8) + "..." : "none"
    });
    if (!sourceRecord) {
      console.log("[Worker] \u2139\uFE0F \u6E90\u8BB0\u5F55\u4E0D\u5B58\u5728\uFF0C\u65E0\u9700\u8FC1\u79FB");
      return c.json({
        status: "not_found",
        error: "\u672A\u627E\u5230\u5BF9\u5E94\u7684\u6307\u7EB9\u6570\u636E",
        errorCode: "FINGERPRINT_NOT_FOUND"
      }, 404);
    }
    const sourceTotalMessages = sourceRecord.total_messages || sourceRecord.stats?.total_messages || 0;
    if (sourceTotalMessages === 0) {
      console.log("[Worker] \u2139\uFE0F \u6E90\u8BB0\u5F55\u65E0\u6709\u6548\u6570\u636E\uFF08total_messages = 0\uFF09\uFF0C\u65E0\u9700\u8FC1\u79FB");
      return c.json({
        status: "no_data",
        error: "\u6E90\u8BB0\u5F55\u65E0\u6709\u6548\u6570\u636E\uFF08total_messages = 0\uFF09\uFF0C\u65E0\u9700\u8FC1\u79FB",
        errorCode: "NO_DATA_TO_MIGRATE"
      }, 200);
    }
    console.log("[Worker] \u2705 \u627E\u5230\u6709\u6548\u6E90\u8BB0\u5F55:", {
      sourceId: sourceRecord.id?.substring(0, 8) + "...",
      successfulFp: successfulFp ? successfulFp.substring(0, 8) + "..." : "none",
      total_messages: sourceTotalMessages,
      has_scores: !!(sourceRecord.l_score || sourceRecord.p_score)
    });
    console.log("[Worker] \u2705 \u6E90\u8BB0\u5F55\u5305\u542B\u6709\u6548\u6570\u636E\uFF0C\u5F00\u59CB\u6267\u884C\u5B57\u6BB5\u7EA7\u8986\u76D6\u8FC1\u79FB");
    console.log("[Worker] \u{1F4CA} \u6E90\u8BB0\u5F55\u6570\u636E\u6458\u8981:", {
      total_messages: sourceTotalMessages,
      has_stats: !!sourceRecord.stats,
      has_scores: !!(sourceRecord.l_score || sourceRecord.p_score),
      has_personality: !!sourceRecord.personality_type
    });
    if (targetRecord) {
      console.log("[Worker] \u2705 \u76EE\u6807\u8BB0\u5F55\u5DF2\u5B58\u5728\uFF08\u53EF\u80FD\u662F\u5360\u4F4D\u8BB0\u5F55\uFF09\uFF0C\u6267\u884C\u5B57\u6BB5\u5408\u5E76\u8FC1\u79FB");
      console.log("[Worker] \u{1F4CB} \u76EE\u6807\u8BB0\u5F55\u72B6\u6001:", {
        id: targetRecord.id?.substring(0, 8) + "...",
        user_identity: targetRecord.user_identity,
        total_messages: targetRecord.total_messages || 0,
        has_data: !!(targetRecord.total_messages && targetRecord.total_messages > 0)
      });
    } else {
      console.log("[Worker] \u2705 \u76EE\u6807\u8BB0\u5F55\u4E0D\u5B58\u5728\uFF0C\u5C06\u521B\u5EFA\u65B0\u8BB0\u5F55\u5E76\u7EE7\u627F\u6E90\u8BB0\u5F55\u6570\u636E");
    }
    const updateData = {
      id: githubUserId,
      user_identity: "github",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (sourceRecord.total_messages !== null && sourceRecord.total_messages !== void 0) {
      updateData.total_messages = sourceRecord.total_messages;
    }
    if (sourceRecord.stats) {
      const sourceStats = typeof sourceRecord.stats === "string" ? JSON.parse(sourceRecord.stats) : sourceRecord.stats;
      updateData.stats = sourceStats;
    }
    if (sourceRecord.l_score !== null && sourceRecord.l_score !== void 0) {
      updateData.l_score = sourceRecord.l_score;
    }
    if (sourceRecord.p_score !== null && sourceRecord.p_score !== void 0) {
      updateData.p_score = sourceRecord.p_score;
    }
    if (sourceRecord.d_score !== null && sourceRecord.d_score !== void 0) {
      updateData.d_score = sourceRecord.d_score;
    }
    if (sourceRecord.e_score !== null && sourceRecord.e_score !== void 0) {
      updateData.e_score = sourceRecord.e_score;
    }
    if (sourceRecord.f_score !== null && sourceRecord.f_score !== void 0) {
      updateData.f_score = sourceRecord.f_score;
    }
    if (sourceRecord.personality_type) {
      updateData.personality_type = sourceRecord.personality_type;
    }
    if (sourceRecord.roast_text) {
      updateData.roast_text = sourceRecord.roast_text;
    }
    if (sourceRecord.personality_data) {
      const sourcePersonalityData = typeof sourceRecord.personality_data === "string" ? JSON.parse(sourceRecord.personality_data) : sourceRecord.personality_data;
      updateData.personality_data = sourcePersonalityData;
      console.log("[Worker] \u2705 \u5DF2\u5305\u542B personality_data \u5B57\u6BB5\uFF0C\u957F\u5EA6:", Array.isArray(sourcePersonalityData) ? sourcePersonalityData.length : "N/A");
    }
    if (successfulFp) {
      updateData.fingerprint = successfulFp;
      console.log("[Worker] \u{1F517} \u6267\u884C\u7269\u7406\u5F52\u4E00\u5316\uFF1A\u5173\u8054\u6307\u7EB9\u5DF2\u5B58\u5165\u6570\u636E\u5E93");
    }
    updateData.user_name = targetRecord?.user_name || sourceRecord?.user_name || "github_user";
    const optionalFields = [
      "total_chars",
      "work_days",
      "dimensions",
      "personality",
      "ketao_count",
      "jiafang_count",
      "tease_count",
      "nonsense_count",
      "ip_location",
      "lat",
      "lng",
      "timezone",
      "browser_lang",
      "personality_name",
      "answer_book",
      "metadata",
      "hourly_activity",
      "risk_level"
    ];
    optionalFields.forEach((field) => {
      if (sourceRecord[field] !== null && sourceRecord[field] !== void 0) {
        if ((field === "dimensions" || field === "personality" || field === "metadata" || field === "hourly_activity") && typeof sourceRecord[field] === "string") {
          try {
            updateData[field] = JSON.parse(sourceRecord[field]);
          } catch (e) {
            console.warn(`[Worker] \u26A0\uFE0F \u5B57\u6BB5 ${field} JSON \u89E3\u6790\u5931\u8D25\uFF0C\u8DF3\u8FC7`);
          }
        } else {
          updateData[field] = sourceRecord[field];
        }
      }
    });
    const cleanedUpdateData = {
      id: githubUserId,
      user_identity: "github",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    Object.keys(updateData).forEach((key) => {
      const value = updateData[key];
      if (value !== null && value !== void 0 && value !== "") {
        cleanedUpdateData[key] = value;
      }
    });
    if (!cleanedUpdateData.user_name) {
      cleanedUpdateData.user_name = targetRecord?.user_name || sourceRecord?.user_name || "github_user";
    }
    console.log("[Worker] \u{1F4CB} \u51C6\u5907\u66F4\u65B0\u7684\u5B57\u6BB5:", Object.keys(cleanedUpdateData));
    console.log("[Worker] \u{1F4CA} \u66F4\u65B0\u6570\u636E\u6458\u8981:", {
      total_messages: cleanedUpdateData.total_messages,
      has_stats: !!cleanedUpdateData.stats,
      has_scores: !!(cleanedUpdateData.l_score || cleanedUpdateData.p_score),
      has_personality: !!cleanedUpdateData.personality_type,
      has_roast_text: !!cleanedUpdateData.roast_text
    });
    const updateUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(githubUserId)}`;
    let updateResponse = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(cleanedUpdateData)
    });
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.warn("[Worker] \u26A0\uFE0F PATCH \u66F4\u65B0\u5931\u8D25\uFF0C\u5C1D\u8BD5\u4F7F\u7528 upsert \u521B\u5EFA\u65B0\u8BB0\u5F55:", {
        status: updateResponse.status,
        error: errorText.substring(0, 200)
      });
      const upsertUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis`;
      updateResponse = await fetch(upsertUrl, {
        method: "POST",
        headers: {
          "apikey": env.SUPABASE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation,resolution=merge-duplicates"
        },
        body: JSON.stringify([cleanedUpdateData])
      });
      if (!updateResponse.ok) {
        const upsertErrorText = await updateResponse.text();
        console.error("[Worker] \u274C Upsert \u4E5F\u5931\u8D25:", {
          status: updateResponse.status,
          error: upsertErrorText.substring(0, 500)
        });
        return c.json({
          status: "error",
          error: "\u66F4\u65B0\u7528\u6237\u6570\u636E\u5931\u8D25",
          errorCode: "UPDATE_FAILED",
          details: upsertErrorText.substring(0, 500),
          attemptedMethods: ["PATCH", "POST upsert"]
        }, 500);
      }
    }
    const updatedUser = await updateResponse.json();
    const migratedUser = Array.isArray(updatedUser) && updatedUser.length > 0 ? updatedUser[0] : updatedUser;
    console.log("[Worker] \u2705 \u7528\u6237\u6570\u636E UPDATE \u6210\u529F:", {
      userId: githubUserId.substring(0, 8) + "...",
      userName: migratedUser?.user_name || "N/A",
      method: updateResponse.status === 200 ? "PATCH" : "POST upsert",
      migratedFields: Object.keys(cleanedUpdateData).length,
      totalMessages: migratedUser?.total_messages || 0,
      hasScores: !!(migratedUser?.l_score || migratedUser?.p_score)
    });
    if (successfulFp) {
      console.log("[Worker] \u{1F504} \u6267\u884C\u7269\u7406\u540C\u6B65\uFF1A\u66F4\u65B0 fingerprint \u5B57\u6BB5...");
      const fingerprintUpdateUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(githubUserId)}`;
      const fingerprintUpdateResponse = await fetch(fingerprintUpdateUrl, {
        method: "PATCH",
        headers: {
          "apikey": env.SUPABASE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          fingerprint: successfulFp,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        })
      });
      if (!fingerprintUpdateResponse.ok) {
        const errorText = await fingerprintUpdateResponse.text();
        console.warn("[Worker] \u26A0\uFE0F fingerprint \u5B57\u6BB5\u66F4\u65B0\u5931\u8D25\uFF08\u4E0D\u5F71\u54CD\u4E3B\u6D41\u7A0B\uFF09:", {
          status: fingerprintUpdateResponse.status,
          error: errorText.substring(0, 200)
        });
      } else {
        const fingerprintUpdateResult = await fingerprintUpdateResponse.json();
        console.log("[Worker] \u2705 fingerprint \u5B57\u6BB5\u7269\u7406\u540C\u6B65\u6210\u529F:", {
          userId: githubUserId.substring(0, 8) + "...",
          fingerprint: successfulFp.substring(0, 8) + "...",
          updated: fingerprintUpdateResult ? "yes" : "no"
        });
        console.log("[Worker] \u2705 v_unified_analysis_v2 \u89C6\u56FE\u73B0\u5728\u53EF\u4EE5\u901A\u8FC7 fingerprint \u5B57\u6BB5\u6B63\u786E\u5173\u8054\u6570\u636E");
      }
    }
    if (sourceRecord.id !== githubUserId) {
      console.log("[Worker] \u{1F5D1}\uFE0F \u5F00\u59CB\u7269\u7406\u6E05\u7406\uFF1A\u5220\u9664\u539F\u6709\u7684\u533F\u540D\u6307\u7EB9\u8BB0\u5F55...");
      console.log("[Worker] \u{1F4CB} \u6E90\u8BB0\u5F55\u4FE1\u606F:", {
        sourceId: sourceRecord.id.substring(0, 8) + "...",
        targetId: githubUserId.substring(0, 8) + "...",
        fingerprint: oldFingerprint.substring(0, 8) + "...",
        sourceTotalMessages
      });
      const deleteUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(sourceRecord.id)}`;
      const deleteResponse = await fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          "apikey": env.SUPABASE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        }
      });
      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        console.error("[Worker] \u274C \u7269\u7406\u6E05\u7406\u5931\u8D25\uFF1A\u5220\u9664\u533F\u540D\u6307\u7EB9\u8BB0\u5F55\u5931\u8D25:", {
          status: deleteResponse.status,
          error: errorText.substring(0, 500)
        });
        return c.json({
          status: "partial_success",
          data: migratedUser,
          message: "\u6570\u636E\u7269\u7406\u8FC7\u6237\u6210\u529F\uFF0C\u4F46\u5220\u9664\u65E7\u8BB0\u5F55\u5931\u8D25",
          warning: "\u65E7\u6307\u7EB9\u8BB0\u5F55\u53EF\u80FD\u4ECD\u5B58\u5728\uFF0C\u53EF\u80FD\u5F71\u54CD v_unified_analysis_v2 \u89C6\u56FE\u7EDF\u8BA1\u548C\u6570\u636E\u5E93\u6027\u80FD",
          errorCode: "DELETE_FAILED",
          details: errorText.substring(0, 500)
        }, 200);
      } else {
        console.log("[Worker] \u2705 \u7269\u7406\u6E05\u7406\u5B8C\u6210\uFF1A\u539F\u6709\u7684\u533F\u540D\u6307\u7EB9\u8BB0\u5F55\u5DF2\u6210\u529F\u5220\u9664");
        console.log("[Worker] \u2705 \u6570\u636E\u5E93\u5DF2\u6E05\u7406\uFF0Cv_unified_analysis_v2 \u89C6\u56FE\u7EDF\u8BA1\u5C06\u4E0D\u4F1A\u51FA\u73B0\u91CD\u590D");
      }
    } else {
      console.log("[Worker] \u2139\uFE0F \u6E90\u8BB0\u5F55 ID \u4E0E\u76EE\u6807 ID \u76F8\u540C\uFF0C\u65E0\u9700\u7269\u7406\u6E05\u7406");
    }
    console.log("[Worker] \u2705 \u6570\u636E\u7269\u7406\u8FC7\u6237\u5B8C\u6210\uFF0C\u6240\u6709\u5206\u6790\u5B57\u6BB5\u5DF2\u6210\u529F\u8FC1\u79FB");
    console.log("[Worker] \u{1F4CA} \u8FC1\u79FB\u6458\u8981:", {
      sourceId: sourceRecord.id?.substring(0, 8) + "...",
      targetId: githubUserId.substring(0, 8) + "...",
      migratedFields: Object.keys(cleanedUpdateData).length,
      hasScores: !!(cleanedUpdateData.l_score || cleanedUpdateData.p_score),
      hasStats: !!cleanedUpdateData.stats,
      hasPersonality: !!cleanedUpdateData.personality_type,
      hasPersonalityData: !!cleanedUpdateData.personality_data,
      hasRoastText: !!cleanedUpdateData.roast_text,
      totalMessages: cleanedUpdateData.total_messages
    });
    return c.json({
      status: "success",
      data: migratedUser,
      message: "\u6570\u636E\u7269\u7406\u8FC7\u6237\u6210\u529F\uFF0C\u6240\u6709\u5206\u6790\u5B57\u6BB5\u5DF2\u8FC1\u79FB\u5B8C\u6210",
      migratedFields: Object.keys(cleanedUpdateData).length,
      requiresRefresh: true
      // 提示前端需要刷新视图
    });
  } catch (error) {
    console.error("[Worker] /api/fingerprint/migrate \u9519\u8BEF:", error);
    const errorMessage = error?.message || error?.toString() || "\u672A\u77E5\u9519\u8BEF";
    const errorStack = error?.stack ? error.stack.substring(0, 500) : null;
    return c.json({
      status: "error",
      error: errorMessage,
      errorCode: "INTERNAL_ERROR",
      details: errorStack
    }, 500);
  }
});
app.post("/api/analyze", async (c) => {
  try {
    const env = c.env;
    const body = await c.req.json();
    const clientIP = c.req.header("CF-Connecting-IP") || "anonymous";
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({
        status: "error",
        success: false,
        error: "Supabase \u73AF\u5883\u53D8\u91CF\u672A\u914D\u7F6E"
      }, 500);
    }
    const sources = [body, body.statistics || {}, body.metadata || {}, body.stats || {}];
    const findVal = /* @__PURE__ */ __name((keys) => {
      for (const source of sources) {
        for (const key of keys) {
          if (source[key] !== void 0 && source[key] !== null) {
            return Number(source[key]);
          }
        }
      }
      return 0;
    }, "findVal");
    const ketao = findVal(["ketao", "qingCount", "politeCount"]);
    const jiafang = findVal(["jiafang", "buCount", "negationCount"]);
    const totalChars = findVal(["totalUserChars", "totalChars", "total_user_chars"]);
    const userMessages = findVal(["userMessages", "totalMessages", "user_messages", "messageCount"]);
    const avgLength = findVal(["avgMessageLength", "avgUserMessageLength", "avg_length"]);
    const days = findVal(["usageDays", "days", "workDays"]);
    const dimensions = body.dimensions || body.stats?.dimensions || {};
    const vibeIndex = String(body.vibeIndex || body.stats?.vibeIndex || "00000");
    const personality = body.personalityType || body.personality || "Unknown";
    let userIdentity;
    if (body.deviceId) {
      const msgUint8 = new TextEncoder().encode(body.deviceId);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
      userIdentity = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } else {
      const signature = `${userMessages}_${totalChars}`;
      const msgUint8 = new TextEncoder().encode(signature);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
      userIdentity = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    console.log("[Debug] \u51C6\u5907\u5199\u5165 user_analysis:", JSON.stringify(body, null, 2));
    const claimToken = crypto.randomUUID();
    console.log("[Worker] \u{1F511} \u4E3A\u533F\u540D\u7528\u6237(v1)\u751F\u6210 claim_token:", claimToken.substring(0, 8) + "...");
    const payload = {
      user_identity: userIdentity,
      claim_token: claimToken,
      // 保存令牌到数据库
      // 强制写入明确数值（保底 50），并与数据库列名（小写）保持一致
      l: Number(dimensions?.L) || 50,
      // 小写字段映射
      p: Number(dimensions?.P) || 50,
      d: Number(dimensions?.D) || 50,
      e: Number(dimensions?.E) || 50,
      f: Number(dimensions?.F) || 50,
      dimensions,
      // 同时保留完整的 JSONB 格式
      vibe_index: vibeIndex,
      personality_type: personality,
      // 注意：user_analysis 表使用 personality_type，不是 personality
      total_messages: userMessages,
      // 注意：user_analysis 表使用 total_messages，不是 user_messages
      total_chars: totalChars,
      // 注意：user_analysis 表使用 total_chars，不是 total_user_chars
      ip_location: clientIP !== "anonymous" ? clientIP : "\u672A\u77E5",
      // 从请求头获取 IP
      // 注意：roast_text 由 /api/v2/analyze 路由生成并保存
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const insertUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis`;
    const insertBody = JSON.stringify([payload]);
    console.log("[Worker] \u{1F4E4} \u51C6\u5907\u63D2\u5165\u6570\u636E\u5230 user_analysis \u8868:", {
      url: insertUrl,
      method: "POST",
      headers: {
        "apikey": "***",
        "Authorization": "Bearer ***",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: insertBody,
      payload
    });
    const writeRes = await fetchSupabase(env, insertUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: insertBody
      // 数组格式：JSON.stringify([payload])
    });
    if (!writeRes.ok) {
      const errorText = await writeRes.text().catch(() => "\u65E0\u6CD5\u8BFB\u53D6\u9519\u8BEF\u4FE1\u606F");
      console.error("[Worker] \u274C \u4FDD\u5B58\u5230 user_analysis \u8868\u5931\u8D25:", {
        status: writeRes.status,
        statusText: writeRes.statusText,
        error: errorText,
        userIdentity,
        payload,
        requestBody: insertBody
      });
    } else {
      console.log("[Worker] \u2705 \u5206\u6790\u6570\u636E\u5DF2\u4FDD\u5B58\u5230 user_analysis \u8868", {
        userIdentity,
        ipLocation: payload.ip_location,
        vibeIndex,
        personalityType: personality,
        dimensions: { l: dimensions.L, p: dimensions.P, d: dimensions.D, e: dimensions.E, f: dimensions.F }
      });
      const executionCtx = c.executionCtx;
      if (executionCtx && typeof executionCtx.waitUntil === "function") {
        executionCtx.waitUntil(refreshGlobalStatsV6Rpc(env));
      }
    }
    const { signal: statsSignal, cancel: cancelStatsTimeout } = createTimeoutSignal(SUPABASE_FETCH_TIMEOUT_MS);
    const [totalUsersRes, globalRes] = await Promise.all([
      fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=totalUsers`, {
        headers: buildSupabaseHeaders(env),
        signal: statsSignal
      }),
      fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`, {
        headers: buildSupabaseHeaders(env),
        signal: statsSignal
      })
    ]).finally(() => {
      cancelStatsTimeout();
    });
    let totalUsers = 1;
    let gRow = {};
    try {
      const totalData = await totalUsersRes.json();
      totalUsers = totalData[0]?.totalUsers || 1;
      if (totalUsers <= 0) {
        console.warn("[Worker] \u26A0\uFE0F \u603B\u4EBA\u6570\u4E3A 0 \u6216\u65E0\u6548\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C 1");
        totalUsers = 1;
      }
    } catch (error) {
      console.error("[Worker] \u274C \u83B7\u53D6\u603B\u4EBA\u6570\u5931\u8D25:", error);
      totalUsers = 1;
    }
    try {
      const globalData = await globalRes.json();
      gRow = globalData[0] || {};
    } catch (error) {
      console.error("[Worker] \u274C \u83B7\u53D6\u5168\u5C40\u5E73\u5747\u503C\u5931\u8D25:", error);
      gRow = {};
    }
    const getRankCount = /* @__PURE__ */ __name(async (column, value) => {
      if (value <= 0 || !value || isNaN(value)) {
        console.warn(`[Worker] \u26A0\uFE0F \u6392\u540D\u67E5\u8BE2\u8DF3\u8FC7\uFF1A\u65E0\u6548\u503C (${column}=${value})`);
        return 0;
      }
      try {
        const numValue = Number(value);
        if (isNaN(numValue) || numValue <= 0) {
          console.warn(`[Worker] \u26A0\uFE0F \u6392\u540D\u67E5\u8BE2\u8DF3\u8FC7\uFF1A\u503C\u4E0D\u662F\u6709\u6548\u6570\u5B57 (${column}=${value})`);
          return 0;
        }
        let mappedColumn = column;
        if (column === "user_messages") {
          mappedColumn = "total_messages";
        } else if (column === "total_user_chars") {
          mappedColumn = "total_chars";
        } else if (column === "days" || column === "jiafang" || column === "ketao" || column === "avg_length") {
          console.warn(`[Worker] \u26A0\uFE0F \u5B57\u6BB5 ${column} \u5728 user_analysis \u8868\u4E2D\u4E0D\u5B58\u5728\uFF0C\u8DF3\u8FC7\u6392\u540D\u67E5\u8BE2`);
          return 0;
        }
        const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?${mappedColumn}=lt.${numValue}&select=id`;
        const res = await fetchSupabase(env, queryUrl, {
          headers: {
            "Prefer": "count=exact",
            "Range": "0-0"
          }
        });
        if (!res.ok) {
          const errorText = await res.text().catch(() => "\u65E0\u6CD5\u8BFB\u53D6\u9519\u8BEF\u4FE1\u606F");
          console.warn(`[Worker] \u26A0\uFE0F \u6392\u540D\u67E5\u8BE2\u5931\u8D25 (${column}):`, {
            status: res.status,
            statusText: res.statusText,
            error: errorText
          });
          return 0;
        }
        const contentRange = res.headers.get("content-range");
        if (contentRange) {
          const parts = contentRange.split("/");
          if (parts.length === 2) {
            const count = parseInt(parts[1]);
            if (!isNaN(count) && count >= 0) {
              return count;
            }
          }
        }
        const data = await res.json().catch(() => null);
        if (Array.isArray(data)) {
          return data.length;
        }
        return 0;
      } catch (error) {
        console.error(`[Worker] \u274C \u6392\u540D\u67E5\u8BE2\u5F02\u5E38 (${column}):`, error);
        return 0;
      }
    }, "getRankCount");
    const [beatMsg, beatChar, beatL, beatP, beatD, beatE, beatF] = await Promise.all([
      getRankCount("total_messages", userMessages),
      // 映射到 total_messages
      getRankCount("total_chars", totalChars),
      // 映射到 total_chars
      getRankCount("l", dimensions.L || 0),
      // 使用维度分 L
      getRankCount("p", dimensions.P || 0),
      // 使用维度分 P
      getRankCount("d", dimensions.D || 0),
      // 使用维度分 D
      getRankCount("e", dimensions.E || 0),
      // 使用维度分 E
      getRankCount("f", dimensions.F || 0)
      // 使用维度分 F
    ]);
    const calcPct = /* @__PURE__ */ __name((count) => {
      if (totalUsers <= 0) return 0;
      const percent = Math.floor(count / totalUsers * 100);
      return Math.min(99, Math.max(0, percent));
    }, "calcPct");
    const ranks = {
      messageRank: calcPct(beatMsg),
      charRank: calcPct(beatChar),
      daysRank: calcPct(beatD),
      // 使用维度 D 替代 days
      jiafangRank: calcPct(beatE),
      // 使用维度 E 替代 jiafang
      ketaoRank: calcPct(beatF),
      // 使用维度 F 替代 ketao
      avgRank: Math.floor((calcPct(beatMsg) + calcPct(beatChar) + calcPct(beatL) + calcPct(beatP) + calcPct(beatD) + calcPct(beatE) + calcPct(beatF)) / 7)
    };
    return c.json({
      status: "success",
      success: true,
      totalUsers,
      claim_token: claimToken,
      // 【关键修复】向前端返回影子令牌，用于登录后认领数据
      ranking: beatMsg,
      rankPercent: ranks.messageRank,
      defeated: beatMsg,
      ranks,
      globalAverage: {
        L: parseFloat(gRow.avg_l || 50),
        P: parseFloat(gRow.avg_p || 50),
        D: parseFloat(gRow.avg_d || 50),
        E: parseFloat(gRow.avg_e || 50),
        F: parseFloat(gRow.avg_f || 50)
      },
      stats: { userMessages, totalChars, days, jiafang, ketao, avgLength }
    });
  } catch (error) {
    console.error("[Worker] /api/analyze \u9519\u8BEF:", error);
    return c.json({
      status: "error",
      success: false,
      error: error.message || "\u672A\u77E5\u9519\u8BEF",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }, 500);
  }
});
function getMonthBucketUtc(date = /* @__PURE__ */ new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}
__name(getMonthBucketUtc, "getMonthBucketUtc");
function normalizeRegion(locationParam) {
  const raw2 = String(locationParam || "").trim();
  if (!raw2) return "Global";
  const upper = raw2.toUpperCase();
  if (upper === "GLOBAL" || upper === "WORLD" || upper === "ALL" || upper === "ALL_USERS") return "Global";
  if (isUSLocation(raw2)) return "US";
  const cleaned = raw2.replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned || "Global";
}
__name(normalizeRegion, "normalizeRegion");
app.get("/api/slang-trends", async (c) => {
  const env = c.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ success: false, error: "Supabase \u672A\u914D\u7F6E" }, 500);
  }
  const location = c.req.query("location");
  const region = normalizeRegion(location);
  const limit = Math.max(1, Math.min(20, Number(c.req.query("limit") || 10)));
  const timeBucket = getMonthBucketUtc(/* @__PURE__ */ new Date());
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends`);
  url.searchParams.set("select", "phrase,hit_count");
  url.searchParams.set("region", `eq.${region}`);
  url.searchParams.set("time_bucket", `eq.${timeBucket}`);
  url.searchParams.set("order", "hit_count.desc");
  url.searchParams.set("limit", String(limit));
  try {
    const rows = await fetchSupabaseJson(env, url.toString(), {
      headers: buildSupabaseHeaders(env)
    });
    const normalized = (Array.isArray(rows) ? rows : []).map((r) => ({
      phrase: String(r?.phrase || ""),
      hit_count: Number(r?.hit_count) || 0
    })).filter((r) => r.phrase);
    return c.json({ success: true, region, timeBucket, items: normalized });
  } catch (err) {
    console.error("[Worker] /api/slang-trends \u9519\u8BEF:", err);
    return c.json({ success: false, error: err?.message || "\u67E5\u8BE2\u5931\u8D25" }, 500);
  }
});
app.get("/api/vibe-keywords", async (c) => {
  const env = c.env;
  const mockData = /* @__PURE__ */ __name(() => [
    { name: "\u9897\u7C92\u5EA6", value: 180 },
    { name: "\u95ED\u73AF", value: 165 },
    { name: "\u65B9\u6CD5\u8BBA", value: 142 },
    { name: "\u5BF9\u9F50", value: 130 },
    { name: "\u843D\u5730", value: 118 },
    { name: "\u6293\u624B", value: 110 },
    { name: "\u590D\u76D8", value: 98 },
    { name: "\u62A4\u57CE\u6CB3", value: 92 },
    { name: "\u8D5B\u9053", value: 86 },
    { name: "\u8D4B\u80FD", value: 80 },
    { name: "\u94FE\u8DEF", value: 76 },
    { name: "\u515C\u5E95", value: 70 },
    { name: "\u89E3\u8026", value: 64 },
    { name: "\u964D\u7EF4\u6253\u51FB", value: 58 }
  ], "mockData");
  const normalizeRows = /* @__PURE__ */ __name((rows) => {
    return (Array.isArray(rows) ? rows : []).map((r) => {
      const name = r?.name ?? r?.phrase ?? r?.keyword ?? r?.word ?? r?.term ?? r?.token ?? "";
      const value = r?.value ?? r?.hit_count ?? r?.count ?? r?.freq ?? r?.frequency ?? r?.total ?? 0;
      const n = String(name || "").trim();
      const v = Number(value);
      return { name: n, value: Number.isFinite(v) ? v : 0 };
    }).filter((x) => x.name && x.value > 0).slice(0, 50);
  }, "normalizeRows");
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ status: "success", data: mockData() });
  }
  const headers = buildSupabaseHeaders(env);
  try {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/v_keyword_stats`);
    url.searchParams.set("select", "*");
    url.searchParams.set("order", "value.desc");
    url.searchParams.set("limit", "50");
    const rows = await fetchSupabaseJson(env, url.toString(), { headers });
    const data = normalizeRows(rows);
    if (data.length > 0) {
      return c.json({ status: "success", data });
    }
  } catch (err) {
    console.warn("[Worker] /api/vibe-keywords v_keyword_stats \u67E5\u8BE2\u5931\u8D25:", err?.message || String(err));
  }
  try {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis_results`);
    url.searchParams.set("select", "*");
    url.searchParams.set("order", "hit_count.desc");
    url.searchParams.set("limit", "50");
    const rows = await fetchSupabaseJson(env, url.toString(), { headers });
    const data = normalizeRows(rows);
    if (data.length > 0) {
      return c.json({ status: "success", data });
    }
  } catch (err) {
    console.warn("[Worker] /api/vibe-keywords user_analysis_results \u67E5\u8BE2\u5931\u8D25:", err?.message || String(err));
  }
  return c.json({ status: "success", data: mockData() });
});
app.get("/api/global-average", async (c) => {
  const env = c.env;
  const countryCode = c.req.query("country_code") || c.req.query("countryCode") || c.req.query("location") || "";
  const wantsUS = isUSLocation(countryCode);
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ success: false, error: "Supabase \u672A\u914D\u7F6E" }, 500);
  }
  let baseRow = null;
  if (env.STATS_STORE) {
    try {
      baseRow = await env.STATS_STORE.get(KV_KEY_GLOBAL_DASHBOARD_DATA, "json");
    } catch (err) {
      console.warn("[Worker] \u26A0\uFE0F /api/global-average KV \u8BFB\u53D6\u5931\u8D25\uFF0C\u56DE\u6E90 Supabase:", err);
    }
  }
  if (!baseRow) {
    try {
      const url = `${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`;
      const data = await fetchSupabaseJson(env, url, {
        headers: buildSupabaseHeaders(env)
      }, SUPABASE_FETCH_TIMEOUT_MS);
      baseRow = (Array.isArray(data) ? data[0] : null) || {};
      if (env.STATS_STORE) {
        try {
          await env.STATS_STORE.put(KV_KEY_GLOBAL_DASHBOARD_DATA, JSON.stringify(baseRow), {
            expirationTtl: KV_GLOBAL_STATS_V6_VIEW_TTL
          });
        } catch (err) {
          console.warn("[Worker] \u26A0\uFE0F /api/global-average KV \u5199\u5165\u5931\u8D25\uFF08\u4E0D\u5F71\u54CD\u8FD4\u56DE\uFF09:", err);
        }
      }
    } catch (err) {
      console.warn("[Worker] \u274C /api/global-average Supabase \u56DE\u6E90\u5931\u8D25:", err?.message || String(err));
      baseRow = {};
    }
  }
  if (baseRow && Array.isArray(baseRow.latest_records)) {
    baseRow.latest_records = baseRow.latest_records.map((r) => ({
      ...r,
      personality_type: r?.p_type ?? r?.personality_type
      // 兼容：p_type -> personality_type
    }));
  }
  const finalRow = wantsUS ? applyUsStatsToGlobalRow(baseRow) : baseRow;
  try {
    const region = normalizeRegion(countryCode);
    const fetchTop = /* @__PURE__ */ __name(async (category) => {
      const url = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends_pool`);
      url.searchParams.set("select", "phrase,hit_count");
      url.searchParams.set("region", `eq.${region}`);
      url.searchParams.set("category", `eq.${category}`);
      url.searchParams.set("order", "hit_count.desc");
      url.searchParams.set("limit", "20");
      const rows = await fetchSupabaseJson(env, url.toString(), {
        headers: buildSupabaseHeaders(env)
      });
      return (Array.isArray(rows) ? rows : []).map((r) => ({ phrase: String(r?.phrase || ""), hit_count: Number(r?.hit_count) || 0 })).filter((x) => x.phrase);
    }, "fetchTop");
    const [slang, merit, svSlang] = await Promise.all([
      fetchTop("slang").catch(() => []),
      fetchTop("merit").catch(() => []),
      fetchTop("sv_slang").catch(() => [])
    ]);
    finalRow.monthlyVibes = {
      slang: Array.isArray(slang) ? slang : [],
      merit: Array.isArray(merit) ? merit : [],
      sv_slang: Array.isArray(svSlang) ? svSlang : []
    };
    finalRow.monthly_vibes = {
      region,
      // pool 口径不带 time_bucket：保留字段但置为 null，避免前端依赖字段不存在
      time_bucket: null,
      slang,
      merit,
      sv_slang: svSlang
    };
    finalRow.monthly_slang = slang.map((x) => x.phrase);
    try {
      const debug = String(c.req.query("debug") || c.req.query("debugSemanticBurst") || "").trim();
      if (debug === "1" || debug.toLowerCase() === "true") {
        finalRow._debugSemanticBurst = {
          countryCodeRaw: String(countryCode || ""),
          regionComputed: region,
          sourceTable: "slang_trends_pool",
          topLimit: 20,
          counts: {
            slang: Array.isArray(slang) ? slang.length : 0,
            merit: Array.isArray(merit) ? merit.length : 0,
            sv_slang: Array.isArray(svSlang) ? svSlang.length : 0
          }
        };
      }
    } catch {
    }
  } catch (e) {
    finalRow.monthly_slang = [];
    finalRow.monthlyVibes = { slang: [], merit: [], sv_slang: [] };
    finalRow.monthly_vibes = {
      region: normalizeRegion(countryCode),
      time_bucket: getMonthBucketUtc(/* @__PURE__ */ new Date()),
      slang: [],
      merit: [],
      sv_slang: []
    };
  }
  return c.json(finalRow);
});
var SEED_DICTIONARY = {
  slang: /* @__PURE__ */ new Set([
    "\u9897\u7C92\u5EA6",
    "\u95ED\u73AF",
    "\u65B9\u6CD5\u8BBA",
    "\u67B6\u6784",
    "\u89E3\u8026",
    "\u5E95\u5C42\u903B\u8F91",
    "\u964D\u7EF4\u6253\u51FB",
    "\u8D4B\u80FD",
    "\u62A4\u57CE\u6CB3",
    "\u8D5B\u9053",
    "\u5BF9\u9F50",
    "\u6293\u624B",
    "\u843D\u5730",
    "\u590D\u76D8",
    "\u94FE\u8DEF",
    "\u8303\u5F0F",
    "\u5FC3\u667A",
    "\u8D28\u68C0",
    "\u515C\u5E95"
  ]),
  merit: /* @__PURE__ */ new Set([
    "\u529F\u5FB7",
    "\u798F\u62A5",
    "\u79EF\u5FB7",
    "\u5584\u4E1A",
    "\u6551\u706B",
    "\u80CC\u9505",
    "\u529F\u52B3",
    "\u52A0\u73ED",
    "\u71AC\u591C"
  ]),
  sv_slang: /* @__PURE__ */ new Set([
    "\u62A4\u57CE\u6CB3",
    "\u589E\u957F",
    "\u878D\u8D44",
    "\u8D5B\u9053",
    "\u5934\u90E8\u6548\u5E94",
    "\u4F30\u503C",
    "\u73B0\u91D1\u6D41",
    "\u5929\u4F7F\u8F6E",
    "A\u8F6E"
  ])
};
function normalizeCategory(input) {
  const raw2 = String(input || "").trim().toLowerCase();
  if (raw2 === "merit") return "merit";
  if (raw2 === "sv_slang" || raw2 === "svslang" || raw2 === "siliconvalley") return "sv_slang";
  return "slang";
}
__name(normalizeCategory, "normalizeCategory");
function toSafeDelta(weight, isSeedHit) {
  const base = Number(weight);
  const baseWeight = Number.isFinite(base) && base > 0 ? Math.floor(base) : 1;
  const mult = isSeedHit ? 10 : 1;
  return Math.max(1, Math.min(500, baseWeight * mult));
}
__name(toSafeDelta, "toSafeDelta");
function toSafePoolDelta(weight) {
  const n = Number(weight);
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  return Math.max(1, Math.min(5, v));
}
__name(toSafePoolDelta, "toSafePoolDelta");
app.post("/api/report-slang", async (c) => {
  const env = c.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ success: false, error: "Supabase \u672A\u914D\u7F6E" }, 500);
  }
  let body = null;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON" }, 400);
  }
  const regionInput = body?.region ?? body?.country_code ?? body?.location;
  let region = normalizeRegion(regionInput);
  try {
    const rawReq = c.req?.raw;
    const cfCountry = String(rawReq?.cf?.country || "").trim().toUpperCase();
    if (region === "Global" && /^[A-Z]{2}$/.test(cfCountry)) {
      region = cfCountry;
    }
  } catch {
  }
  const itemsRaw = Array.isArray(body?.items) ? body.items : [];
  const phrasesRaw = Array.isArray(body?.phrases) ? body.phrases : [];
  const items = [];
  for (const it of itemsRaw) {
    const phrase = String(it?.phrase || "").trim();
    if (!phrase || phrase.length < 2 || phrase.length > 24) continue;
    const category = normalizeCategory(it?.category);
    const isSeedHit = SEED_DICTIONARY[category]?.has(phrase) || false;
    const delta = toSafeDelta(it?.weight ?? 1, isSeedHit);
    items.push({ phrase, category, delta });
    if (items.length >= 15) break;
  }
  if (items.length === 0) {
    for (const p of phrasesRaw) {
      const phrase = String(p || "").trim();
      if (!phrase || phrase.length < 2 || phrase.length > 24) continue;
      const isSeedHit = SEED_DICTIONARY.slang.has(phrase);
      const delta = toSafeDelta(1, isSeedHit);
      items.push({ phrase, category: "slang", delta });
      if (items.length >= 10) break;
    }
  }
  if (items.length === 0) {
    return c.json({ success: true, queued: false });
  }
  const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/upsert_slang_hits_v2`;
  c.executionCtx.waitUntil((async () => {
    for (const it of items) {
      try {
        await fetchSupabaseJson(env, rpcUrl, {
          method: "POST",
          headers: buildSupabaseHeaders(env, { "Content-Type": "application/json" }),
          body: JSON.stringify({
            p_phrase: it.phrase,
            p_region: region,
            p_category: it.category,
            p_delta: it.delta
          })
        });
      } catch (err) {
        console.warn("[Worker] \u26A0\uFE0F /api/report-slang upsert_slang_hits_v2 \u5931\u8D25:", err?.message || String(err));
      }
    }
  })());
  return c.json({ success: true, queued: true, region, items: items.length });
});
app.post("/api/v2/report-vibe", async (c) => {
  const env = c.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ status: "error", error: "Supabase \u672A\u914D\u7F6E" }, 500);
  }
  let body = null;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ status: "error", error: "Invalid JSON" }, 400);
  }
  let region = normalizeRegion(body?.region ?? body?.country_code ?? body?.location ?? "Global");
  try {
    const rawReq = c.req?.raw;
    const cfCountry = String(rawReq?.cf?.country || "").trim().toUpperCase();
    if (region === "Global" && /^[A-Z]{2}$/.test(cfCountry)) {
      region = cfCountry;
    }
  } catch {
  }
  const keywords = Array.isArray(body?.keywords) ? body.keywords : [];
  const items = [];
  for (const it of keywords) {
    const phrase = String(it?.phrase || "").trim();
    if (!phrase || phrase.length < 2 || phrase.length > 120) continue;
    const category = normalizeCategory(it?.category);
    const delta = toSafePoolDelta(it?.weight ?? 1);
    items.push({ phrase, category, delta });
    if (items.length >= 25) break;
  }
  if (items.length === 0) {
    return c.json({ status: "success", queued: false });
  }
  const poolRpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/upsert_slang_pool_hits_v1`;
  c.executionCtx.waitUntil((async () => {
    for (const it of items) {
      try {
        await fetchSupabaseJson(env, poolRpcUrl, {
          method: "POST",
          headers: buildSupabaseHeaders(env, { "Content-Type": "application/json" }),
          body: JSON.stringify({
            p_phrase: it.phrase,
            p_region: region,
            p_category: it.category,
            p_delta: it.delta
          })
        });
      } catch (err) {
        console.warn("[Worker] \u26A0\uFE0F /api/v2/report-vibe upsert_slang_pool_hits_v1 \u5931\u8D25:", err?.message || String(err));
      }
    }
  })());
  return c.json({ status: "success", queued: true });
});
var handleWordCloudRequest = /* @__PURE__ */ __name(async (c) => {
  const env = c.env;
  const regionRaw = (c.req.query("region") || c.req.query("country") || "").trim().toUpperCase();
  if (regionRaw && /^[A-Z]{2}$/.test(regionRaw)) {
    c.header("Cache-Control", "public, max-age=60");
  } else {
    c.header("Cache-Control", "public, max-age=3600");
  }
  const fallback = [
    { name: "\u9897\u7C92\u5EA6", value: 180, category: "slang" },
    { name: "\u95ED\u73AF", value: 165, category: "slang" },
    { name: "\u65B9\u6CD5\u8BBA", value: 142, category: "slang" },
    { name: "\u5BF9\u9F50", value: 130, category: "slang" },
    { name: "\u843D\u5730", value: 118, category: "slang" },
    { name: "\u6293\u624B", value: 110, category: "slang" },
    { name: "\u590D\u76D8", value: 98, category: "slang" },
    { name: "\u62A4\u57CE\u6CB3", value: 92, category: "sv_slang" },
    { name: "\u8D5B\u9053", value: 86, category: "sv_slang" },
    { name: "\u515C\u5E95", value: 70, category: "slang" },
    { name: "\u529F\u5FB7", value: 60, category: "merit" },
    { name: "\u798F\u62A5", value: 55, category: "merit" }
  ];
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    c.header("Cache-Control", "no-store");
    return c.json({ status: "success", data: fallback });
  }
  if (regionRaw && /^[A-Z]{2}$/.test(regionRaw)) {
    try {
      const poolUrl = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends_pool`);
      poolUrl.searchParams.set("select", "phrase,hit_count,category");
      poolUrl.searchParams.set("region", `eq.${regionRaw}`);
      poolUrl.searchParams.set("order", "hit_count.desc");
      poolUrl.searchParams.set("limit", "50");
      try {
        const poolRows = await fetchSupabaseJson(env, poolUrl.toString(), {
          headers: buildSupabaseHeaders(env)
        });
        const poolData = (Array.isArray(poolRows) ? poolRows : []).map((r) => ({
          name: String(r?.phrase ?? r?.name ?? "").trim(),
          value: Number(r?.hit_count ?? r?.value ?? r?.count ?? 0) || 0,
          category: String(r?.category ?? "slang").trim() || "slang"
        })).filter((x) => x.name && x.value > 0).slice(0, 50);
        if (poolData.length > 0) {
          const phrases = Array.from(new Set(poolData.map((x) => x.name))).slice(0, 50);
          const globalCountsRpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_slang_pool_global_counts_v1`;
          let globalCounts = {};
          try {
            const rows2 = await fetchSupabaseJson(env, globalCountsRpcUrl, {
              method: "POST",
              headers: buildSupabaseHeaders(env, { "Content-Type": "application/json" }),
              body: JSON.stringify({ p_phrases: phrases })
            });
            globalCounts = Object.fromEntries(
              (Array.isArray(rows2) ? rows2 : []).map((it) => [
                String(it?.phrase ?? "").trim(),
                Number(it?.global_count ?? 0) || 0
              ]).filter(([p]) => p)
            );
          } catch {
          }
          const regionTotal = poolData.reduce((s, x) => s + (Number(x.value) || 0), 0) || 0;
          const globalTotal = phrases.reduce((s, p) => s + (Number(globalCounts[p]) || 0), 0) || 0;
          const SIGNATURE_MULTIPLIER_THRESHOLD = 3;
          const SIGNATURE_MIN_REGION_COUNT = 5;
          const data2 = poolData.map((x) => {
            const regionCount = Number(x.value) || 0;
            const globalCount = Number(globalCounts[x.name]) || 0;
            const regionRatio = regionTotal > 0 ? regionCount / regionTotal : 0;
            const globalRatio = globalTotal > 0 ? globalCount / globalTotal : 0;
            const multiplier = globalRatio > 0 ? regionRatio / globalRatio : 0;
            const isNationalSignature = regionCount >= SIGNATURE_MIN_REGION_COUNT && multiplier >= SIGNATURE_MULTIPLIER_THRESHOLD;
            return {
              ...x,
              signature: isNationalSignature ? "National Signature" : null,
              signatureMultiplier: Number.isFinite(multiplier) ? Number(multiplier.toFixed(2)) : 0
            };
          });
          return c.json({ status: "success", data: data2 });
        }
      } catch {
      }
      const now = /* @__PURE__ */ new Date();
      const bucket = `${now.toISOString().slice(0, 7)}-01`;
      const url = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends`);
      url.searchParams.set("select", "phrase,hit_count,category");
      url.searchParams.set("region", `eq.${regionRaw}`);
      url.searchParams.set("time_bucket", `eq.${bucket}`);
      url.searchParams.set("order", "hit_count.desc");
      url.searchParams.set("limit", "50");
      let rows = await fetchSupabaseJson(env, url.toString(), {
        headers: buildSupabaseHeaders(env)
      });
      if (!Array.isArray(rows) || rows.length === 0) {
        const url2 = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends`);
        url2.searchParams.set("select", "phrase,hit_count,category");
        url2.searchParams.set("region", `eq.${regionRaw}`);
        url2.searchParams.set("order", "hit_count.desc");
        url2.searchParams.set("limit", "50");
        rows = await fetchSupabaseJson(env, url2.toString(), {
          headers: buildSupabaseHeaders(env)
        });
      }
      const data = (Array.isArray(rows) ? rows : []).map((r) => ({
        name: String(r?.phrase ?? r?.name ?? "").trim(),
        value: Number(r?.hit_count ?? r?.value ?? r?.count ?? 0) || 0,
        category: String(r?.category ?? "slang").trim() || "slang"
      })).filter((x) => x.name && x.value > 0).slice(0, 50);
      if (data.length > 0) return c.json({ status: "success", data });
      c.header("Cache-Control", "no-store");
      return c.json({ status: "success", data: [] });
    } catch (e) {
      console.warn("[Worker] \u26A0\uFE0F \u5730\u533A\u8BCD\u4E91\u67E5\u8BE2\u5931\u8D25\uFF0C\u56DE\u9000\u5168\u5C40\u8BCD\u4E91:", regionRaw, e?.message || String(e));
    }
  }
  try {
    const cloudData = await getAggregatedWordCloud(env);
    if (cloudData && cloudData.length > 0) {
      console.log("[Worker] \u2705 \u8BCD\u4E91\u6570\u636E\u4ECE KV \u7F13\u5B58\u83B7\u53D6:", cloudData.length, "\u6761");
      return c.json({ status: "success", data: cloudData });
    }
  } catch (e) {
    console.warn("[Worker] \u26A0\uFE0F \u4ECE KV \u83B7\u53D6\u8BCD\u4E91\u6570\u636E\u5931\u8D25\uFF0C\u56DE\u6E90 Supabase:", e?.message || String(e));
  }
  try {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/v_keyword_stats`);
    url.searchParams.set("select", "*");
    url.searchParams.set("order", "value.desc");
    url.searchParams.set("limit", "50");
    const rows = await fetchSupabaseJson(env, url.toString(), {
      headers: buildSupabaseHeaders(env)
    });
    const data = (Array.isArray(rows) ? rows : []).map((r) => ({
      name: String(r?.name ?? r?.phrase ?? r?.keyword ?? "").trim(),
      value: Number(r?.value ?? r?.hit_count ?? r?.count ?? 0) || 0,
      // 【V6.0 新增】推断 category（基于词汇列表）
      category: inferCategory(String(r?.name ?? r?.phrase ?? r?.keyword ?? "").trim())
    })).filter((x) => x.name && x.value > 0).slice(0, 50);
    if (data.length > 0) {
      return c.json({ status: "success", data });
    }
  } catch (e) {
  }
  try {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/keyword_logs`);
    url.searchParams.set("select", "phrase");
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", "5000");
    const rows = await fetchSupabaseJson(env, url.toString(), {
      headers: buildSupabaseHeaders(env)
    });
    const counter = /* @__PURE__ */ new Map();
    for (const r of Array.isArray(rows) ? rows : []) {
      const p = String(r?.phrase || "").trim();
      if (!p) continue;
      counter.set(p, (counter.get(p) || 0) + 1);
    }
    const data = Array.from(counter.entries()).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([name, value]) => ({
      name,
      value,
      // 【V6.0 新增】推断 category
      category: inferCategory(name)
    }));
    if (data.length > 0) {
      return c.json({ status: "success", data });
    }
  } catch (e) {
  }
  c.header("Cache-Control", "no-store");
  return c.json({ status: "success", data: fallback });
}, "handleWordCloudRequest");
app.get("/api/v2/world-cloud", handleWordCloudRequest);
app.get("/api/v2/wordcloud-data", handleWordCloudRequest);
app.get("/api/country-summary", async (c) => {
  try {
    const country = (c.req.query("country") || "").trim().toUpperCase();
    if (!country || country.length !== 2) {
      return c.json({ success: false, error: "country \u5FC5\u586B\u4E14\u4E3A 2 \u4F4D\u56FD\u5BB6\u4EE3\u7801" }, 400);
    }
    const env = c.env;
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({ success: false, error: "Supabase \u672A\u914D\u7F6E" }, 500);
    }
    const url = `${env.SUPABASE_URL}/rest/v1/user_analysis?select=id,total_messages,total_chars,l_score,p_score,d_score,e_score,f_score,personality_type,ip_location,manual_location&or=(ip_location.eq.${country},manual_location.eq.${country})`;
    const res = await fetchSupabase(env, url, {});
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.warn("[Worker] /api/country-summary \u67E5\u8BE2\u5931\u8D25:", res.status, err);
      return c.json({ success: false, error: "\u67E5\u8BE2\u5931\u8D25" }, 502);
    }
    const rows = await res.json();
    const n = rows.length;
    if (n === 0) {
      const empty = {
        success: true,
        totalUsers: 0,
        totalAnalysis: 0,
        totalChars: 0,
        avgPerUser: 0,
        avgPerScan: 0,
        globalAverage: { L: 50, P: 50, D: 50, E: 50, F: 50 },
        averages: { L: 50, P: 50, D: 50, E: 50, F: 50 },
        locationRank: [],
        personalityRank: [],
        personalityDistribution: [],
        latestRecords: []
      };
      return c.json(empty);
    }
    const totalMessages = rows.reduce((s, r) => s + (Number(r.total_messages) || 0), 0);
    const totalChars = rows.reduce((s, r) => s + (Number(r.total_chars) || 0), 0);
    const sumL = rows.reduce((s, r) => s + (Number(r.l_score) ?? Number(r.l) ?? 50), 0);
    const sumP = rows.reduce((s, r) => s + (Number(r.p_score) ?? Number(r.p) ?? 50), 0);
    const sumD = rows.reduce((s, r) => s + (Number(r.d_score) ?? Number(r.d) ?? 50), 0);
    const sumE = rows.reduce((s, r) => s + (Number(r.e_score) ?? Number(r.e) ?? 50), 0);
    const sumF = rows.reduce((s, r) => s + (Number(r.f_score) ?? Number(r.f) ?? 50), 0);
    const avgL = Math.round(sumL / n);
    const avgP = Math.round(sumP / n);
    const avgD = Math.round(sumD / n);
    const avgE = Math.round(sumE / n);
    const avgF = Math.round(sumF / n);
    const typeCount = /* @__PURE__ */ new Map();
    rows.forEach((r) => {
      const t = r.personality_type || "UNKNOWN";
      typeCount.set(t, (typeCount.get(t) || 0) + 1);
    });
    const personalityRank = Array.from(typeCount.entries()).map(([type, count]) => ({ type, count, percentage: Math.round(count / n * 100) })).sort((a, b) => b.count - a.count);
    const out = {
      success: true,
      totalUsers: n,
      totalAnalysis: totalMessages,
      totalChars,
      avgPerUser: n > 0 ? Math.round(totalChars / n) : 0,
      avgPerScan: n > 0 ? Math.round(totalChars / Math.max(1, totalMessages)) : 0,
      globalAverage: { L: avgL, P: avgP, D: avgD, E: avgE, F: avgF },
      averages: { L: avgL, P: avgP, D: avgD, E: avgE, F: avgF },
      locationRank: [{ name: country, value: n }],
      personalityRank,
      personalityDistribution: personalityRank,
      latestRecords: rows.slice(0, 5).map((r) => ({
        name: r.user_name || "\u672A\u77E5",
        type: r.personality_type || "UNKNOWN",
        location: r.manual_location || r.ip_location || country,
        time: r.updated_at || r.created_at || ""
      }))
    };
    return c.json(out);
  } catch (e) {
    console.error("[Worker] /api/country-summary \u9519\u8BEF:", e);
    return c.json({ success: false, error: e.message || "\u670D\u52A1\u5668\u9519\u8BEF" }, 500);
  }
});
app.get("/api/stats/dashboard", async (c) => {
  try {
    const env = c.env;
    console.log("[Worker] \u5F00\u59CB\u5904\u7406 /api/stats/dashboard \u8BF7\u6C42");
    let totalUsers = 0;
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=totalUsers`, {
          headers: {
            "apikey": env.SUPABASE_KEY,
            "Authorization": `Bearer ${env.SUPABASE_KEY}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          totalUsers = data[0]?.totalUsers || 0;
          console.log("[Worker] \u83B7\u53D6\u603B\u7528\u6237\u6570:", totalUsers);
        }
      } catch (error) {
        console.warn("[Worker] \u83B7\u53D6\u603B\u7528\u6237\u6570\u5931\u8D25:", error);
      }
    }
    let averages = { L: 50, P: 50, D: 50, E: 50, F: 50 };
    if (env.STATS_STORE) {
      try {
        console.log("[Worker] \u5C1D\u8BD5\u4ECE KV \u8BFB\u53D6 GLOBAL_AVERAGES...");
        const cached = await env.STATS_STORE.get(KV_KEY_GLOBAL_AVERAGES, "json");
        if (cached) {
          averages = cached;
          console.log("[Worker] \u2705 \u4ECE KV \u8BFB\u53D6 GLOBAL_AVERAGES \u6210\u529F:", averages);
        } else {
          console.log("[Worker] GLOBAL_AVERAGES \u4E0D\u5B58\u5728\uFF0C\u5C1D\u8BD5\u8BFB\u53D6 global_average...");
          const fallback = await env.STATS_STORE.get(KV_KEY_GLOBAL_AVERAGE, "json");
          if (fallback) {
            averages = fallback;
            console.log("[Worker] \u2705 \u4ECE KV \u8BFB\u53D6 global_average \u6210\u529F:", averages);
          } else {
            console.log("[Worker] KV \u4E2D\u672A\u627E\u5230\u5E73\u5747\u503C\u6570\u636E\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C:", averages);
          }
        }
      } catch (error) {
        console.warn("[Worker] \u26A0\uFE0F \u4ECE KV \u8BFB\u53D6\u5168\u5C40\u5E73\u5747\u503C\u5931\u8D25\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C:", error);
        averages = { L: 50, P: 50, D: 50, E: 50, F: 50 };
      }
    } else {
      console.log("[Worker] STATS_STORE \u672A\u914D\u7F6E\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u5E73\u5747\u503C");
    }
    let locations = [];
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        console.log("[Worker] \u5F00\u59CB\u67E5\u8BE2\u5730\u7406\u4F4D\u7F6E\u5206\u5E03...");
        const res = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_analysis?select=ip_location&ip_location=not.is.null`,
          {
            headers: {
              "apikey": env.SUPABASE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_KEY}`
            }
          }
        );
        if (res.ok) {
          const data = await res.json();
          console.log("[Worker] \u67E5\u8BE2\u5230\u5730\u7406\u4F4D\u7F6E\u8BB0\u5F55\u6570:", data.length);
          const locationMap = /* @__PURE__ */ new Map();
          data.forEach((item) => {
            if (item.ip_location && item.ip_location !== "\u672A\u77E5") {
              const count = locationMap.get(item.ip_location) || 0;
              locationMap.set(item.ip_location, count + 1);
            }
          });
          locations = Array.from(locationMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
          console.log("[Worker] \u2705 \u5730\u7406\u4F4D\u7F6E\u5206\u5E03\u7EDF\u8BA1\u5B8C\u6210\uFF0CTop 10:", locations);
        } else {
          console.warn("[Worker] \u67E5\u8BE2\u5730\u7406\u4F4D\u7F6E\u5206\u5E03\u5931\u8D25\uFF0CHTTP \u72B6\u6001:", res.status);
        }
      } catch (error) {
        console.warn("[Worker] \u83B7\u53D6\u5730\u7406\u4F4D\u7F6E\u5206\u5E03\u5931\u8D25:", error);
      }
    }
    let recent = [];
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        console.log("[Worker] \u5F00\u59CB\u67E5\u8BE2\u6700\u8FD1\u52A8\u6001...");
        const res = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_analysis?select=created_at,personality_type&order=created_at.desc&limit=5`,
          {
            headers: {
              "apikey": env.SUPABASE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_KEY}`
            }
          }
        );
        if (res.ok) {
          const data = await res.json();
          recent = data.map((item) => ({
            time: item.created_at || (/* @__PURE__ */ new Date()).toISOString(),
            type: item.personality_type || "UNKNOWN"
          }));
          console.log("[Worker] \u2705 \u83B7\u53D6\u6700\u8FD1\u52A8\u6001\u6210\u529F\uFF0C\u8BB0\u5F55\u6570:", recent.length);
        } else {
          console.warn("[Worker] \u67E5\u8BE2\u6700\u8FD1\u52A8\u6001\u5931\u8D25\uFF0CHTTP \u72B6\u6001:", res.status);
        }
      } catch (error) {
        console.warn("[Worker] \u83B7\u53D6\u6700\u8FD1\u52A8\u6001\u5931\u8D25:", error);
      }
    }
    const result = {
      status: "success",
      totalUsers,
      averages,
      locations,
      recent
    };
    console.log("[Worker] \u2705 /api/stats/dashboard \u5904\u7406\u5B8C\u6210:", {
      totalUsers,
      locationsCount: locations.length,
      recentCount: recent.length
    });
    return c.json(result);
  } catch (error) {
    console.error("[Worker] \u274C /api/stats/dashboard \u9519\u8BEF:", error);
    return c.json({
      status: "error",
      error: error.message || "\u672A\u77E5\u9519\u8BEF",
      totalUsers: 0,
      averages: { L: 50, P: 50, D: 50, E: 50, F: 50 },
      locations: [],
      recent: []
    }, 500);
  }
});
async function performAggregation(env) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      const error = "Supabase \u73AF\u5883\u53D8\u91CF\u672A\u914D\u7F6E";
      console.warn(`[Worker] \u26A0\uFE0F ${error}`);
      return { success: false, error };
    }
    if (!env.STATS_STORE) {
      const error = "KV \u672A\u914D\u7F6E";
      console.warn(`[Worker] \u26A0\uFE0F ${error}`);
      return { success: false, error };
    }
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`, {
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`
      }
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "\u65E0\u6CD5\u8BFB\u53D6\u9519\u8BEF\u4FE1\u606F");
      throw new Error(`Supabase \u67E5\u8BE2\u5931\u8D25: ${res.status}, ${errorText}`);
    }
    const data = await res.json();
    let row = data[0] || {};
    const viewTotalUsers = Number(row?.totalUsers ?? row?.total_users ?? 0) || 0;
    if (!row || viewTotalUsers <= 0) {
      console.log("[Worker] \u26A0\uFE0F performAggregation: \u6570\u636E\u5E93\u8FD4\u56DE\u4E3A\u7A7A\u6216 totalUsers \u4E3A 0\uFF0C\u4F7F\u7528\u4FDD\u5E95\u6570\u636E\uFF08\u5F53\u524D\u7528\u6237\uFF09");
      row = {
        totalUsers: 1,
        // 强制显示 1，因为当前用户就在这
        total_users: 1,
        // 兼容旧字段
        avg_l: 65,
        avg_p: 45,
        avg_d: 50,
        avg_e: 55,
        avg_f: 40
      };
    }
    const globalAverage = {
      L: parseFloat(row.avg_l || row.avg_L || row.L || 50),
      P: parseFloat(row.avg_p || row.avg_P || row.P || 50),
      D: parseFloat(row.avg_d || row.avg_D || row.D || 50),
      E: parseFloat(row.avg_e || row.avg_E || row.E || 50),
      F: parseFloat(row.avg_f || row.avg_F || row.F || 50)
    };
    const defaultDimensions = {
      L: { label: "\u903B\u8F91\u529B" },
      P: { label: "\u8010\u5FC3\u503C" },
      D: { label: "\u7EC6\u817B\u5EA6" },
      E: { label: "\u60C5\u7EEA\u5316" },
      F: { label: "\u9891\u7387\u611F" }
    };
    const now = Math.floor(Date.now() / 1e3);
    const cachePayload = {
      ...globalAverage,
      dimensions: defaultDimensions
      // 添加 dimensions 到缓存，用于版本校验
    };
    await env.STATS_STORE.put(KV_KEY_GLOBAL_AVERAGE, JSON.stringify(cachePayload));
    await env.STATS_STORE.put(KV_KEY_LAST_UPDATE, now.toString());
    console.log("[Worker] \u2705 \u6C47\u603B\u4EFB\u52A1\u5B8C\u6210\uFF0C\u5DF2\u5199\u5165 KV:", {
      globalAverage,
      timestamp: now,
      kvKeys: {
        average: KV_KEY_GLOBAL_AVERAGE,
        lastUpdate: KV_KEY_LAST_UPDATE
      }
    });
    return { success: true, globalAverage };
  } catch (error) {
    const errorMessage = error.message || "\u672A\u77E5\u9519\u8BEF";
    console.error("[Worker] \u274C \u6C47\u603B\u4EFB\u52A1\u5931\u8D25:", errorMessage);
    return { success: false, error: errorMessage };
  }
}
__name(performAggregation, "performAggregation");
async function updateGlobalStatsV6(env, stats, dimensions) {
  if (!env.STATS_STORE) {
    return;
  }
  try {
    const existing = await getGlobalStatsV6(env);
    const now = Math.floor(Date.now() / 1e3);
    if (existing) {
      const totalUsers = existing.totalUsers + 1;
      const weight = 1 / totalUsers;
      const newGlobalStats = {
        totalUsers,
        avgDimensions: {
          L: existing.avgDimensions.L * (1 - weight) + dimensions.L * weight,
          P: existing.avgDimensions.P * (1 - weight) + dimensions.P * weight,
          D: existing.avgDimensions.D * (1 - weight) + dimensions.D * weight,
          E: existing.avgDimensions.E * (1 - weight) + dimensions.E * weight,
          F: existing.avgDimensions.F * (1 - weight) + dimensions.F * weight
        },
        avgStats: {
          ketao_count: existing.avgStats.ketao_count * (1 - weight) + stats.ketao_count * weight,
          jiafang_count: existing.avgStats.jiafang_count * (1 - weight) + stats.jiafang_count * weight,
          tease_count: existing.avgStats.tease_count * (1 - weight) + stats.tease_count * weight,
          nonsense_count: existing.avgStats.nonsense_count * (1 - weight) + stats.nonsense_count * weight,
          slang_count: existing.avgStats.slang_count * (1 - weight) + stats.slang_count * weight,
          abuse_value: existing.avgStats.abuse_value * (1 - weight) + stats.abuse_value * weight,
          style_index: existing.avgStats.style_index * (1 - weight) + stats.style_index * weight,
          avg_payload: existing.avgStats.avg_payload * (1 - weight) + stats.avg_payload * weight
        },
        topBlackwords: existing.topBlackwords,
        // 黑话统计需要定期全量计算
        lastUpdate: now
      };
      await env.STATS_STORE.put(KV_KEY_GLOBAL_STATS_V6, JSON.stringify(newGlobalStats));
      console.log("[Worker] \u2705 V6 \u5168\u5C40\u7EDF\u8BA1\u5DF2\u589E\u91CF\u66F4\u65B0:", {
        totalUsers: newGlobalStats.totalUsers,
        avgDimensions: newGlobalStats.avgDimensions
      });
    } else {
      const initialStats = {
        totalUsers: 1,
        avgDimensions: dimensions,
        avgStats: {
          ketao_count: stats.ketao_count,
          jiafang_count: stats.jiafang_count,
          tease_count: stats.tease_count,
          nonsense_count: stats.nonsense_count,
          slang_count: stats.slang_count,
          abuse_value: stats.abuse_value,
          style_index: stats.style_index,
          avg_payload: stats.avg_payload
        },
        topBlackwords: [],
        lastUpdate: now
      };
      await env.STATS_STORE.put(KV_KEY_GLOBAL_STATS_V6, JSON.stringify(initialStats));
      console.log("[Worker] \u2705 V6 \u5168\u5C40\u7EDF\u8BA1\u5DF2\u521D\u59CB\u5316");
    }
  } catch (error) {
    console.warn("[Worker] \u26A0\uFE0F \u66F4\u65B0 V6 \u5168\u5C40\u7EDF\u8BA1\u5931\u8D25:", error);
  }
}
__name(updateGlobalStatsV6, "updateGlobalStatsV6");
async function performV6Aggregation(env) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return { success: false, error: "Supabase \u73AF\u5883\u53D8\u91CF\u672A\u914D\u7F6E" };
    }
    if (!env.STATS_STORE) {
      return { success: false, error: "KV \u672A\u914D\u7F6E" };
    }
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_analysis?select=stats,dimensions&stats=not.is.null`,
      {
        headers: {
          "apikey": env.SUPABASE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_KEY}`
        }
      }
    );
    if (!res.ok) {
      const errorText = await res.text().catch(() => "\u65E0\u6CD5\u8BFB\u53D6\u9519\u8BEF\u4FE1\u606F");
      throw new Error(`Supabase \u67E5\u8BE2\u5931\u8D25: ${res.status}, ${errorText}`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return { success: false, error: "\u6CA1\u6709\u6570\u636E\u53EF\u805A\u5408" };
    }
    let totalUsers = 0;
    const dimensionSums = { L: 0, P: 0, D: 0, E: 0, F: 0 };
    const statsSums = {
      ketao_count: 0,
      jiafang_count: 0,
      tease_count: 0,
      nonsense_count: 0,
      slang_count: 0,
      abuse_value: 0,
      style_index: 0,
      avg_payload: 0
    };
    const blackwordCounts = /* @__PURE__ */ new Map();
    data.forEach((row) => {
      const stats = row.stats;
      const dims = row.dimensions || {};
      if (stats && typeof stats === "object") {
        totalUsers++;
        dimensionSums.L += dims.L || 0;
        dimensionSums.P += dims.P || 0;
        dimensionSums.D += dims.D || 0;
        dimensionSums.E += dims.E || 0;
        dimensionSums.F += dims.F || 0;
        statsSums.ketao_count += stats.ketao_count || 0;
        statsSums.jiafang_count += stats.jiafang_count || 0;
        statsSums.tease_count += stats.tease_count || 0;
        statsSums.nonsense_count += stats.nonsense_count || 0;
        statsSums.slang_count += stats.slang_count || 0;
        statsSums.abuse_value += stats.abuse_value || 0;
        statsSums.style_index += stats.style_index || 0;
        statsSums.avg_payload += stats.avg_payload || 0;
        if (stats.blackword_hits) {
          const chineseSlang = stats.blackword_hits.chinese_slang || {};
          const englishSlang = stats.blackword_hits.english_slang || {};
          Object.entries(chineseSlang).forEach(([word, count]) => {
            blackwordCounts.set(word, (blackwordCounts.get(word) || 0) + count);
          });
          Object.entries(englishSlang).forEach(([word, count]) => {
            blackwordCounts.set(word, (blackwordCounts.get(word) || 0) + count);
          });
        }
      }
    });
    const globalStats = {
      totalUsers,
      avgDimensions: {
        L: totalUsers > 0 ? dimensionSums.L / totalUsers : 50,
        P: totalUsers > 0 ? dimensionSums.P / totalUsers : 50,
        D: totalUsers > 0 ? dimensionSums.D / totalUsers : 50,
        E: totalUsers > 0 ? dimensionSums.E / totalUsers : 50,
        F: totalUsers > 0 ? dimensionSums.F / totalUsers : 50
      },
      avgStats: {
        ketao_count: totalUsers > 0 ? statsSums.ketao_count / totalUsers : 0,
        jiafang_count: totalUsers > 0 ? statsSums.jiafang_count / totalUsers : 0,
        tease_count: totalUsers > 0 ? statsSums.tease_count / totalUsers : 0,
        nonsense_count: totalUsers > 0 ? statsSums.nonsense_count / totalUsers : 0,
        slang_count: totalUsers > 0 ? statsSums.slang_count / totalUsers : 0,
        abuse_value: totalUsers > 0 ? statsSums.abuse_value / totalUsers : 0,
        style_index: totalUsers > 0 ? statsSums.style_index / totalUsers : 0,
        avg_payload: totalUsers > 0 ? statsSums.avg_payload / totalUsers : 0
      },
      topBlackwords: Array.from(blackwordCounts.entries()).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      // Top 10
      lastUpdate: Math.floor(Date.now() / 1e3)
    };
    await env.STATS_STORE.put(KV_KEY_GLOBAL_STATS_V6, JSON.stringify(globalStats));
    console.log("[Worker] \u2705 V6 \u5168\u91CF\u805A\u5408\u5B8C\u6210:", {
      totalUsers: globalStats.totalUsers,
      topBlackwords: globalStats.topBlackwords.length
    });
    return { success: true };
  } catch (error) {
    console.error("[Worker] \u274C V6 \u5168\u91CF\u805A\u5408\u5931\u8D25:", error);
    return { success: false, error: error.message || "\u672A\u77E5\u9519\u8BEF" };
  }
}
__name(performV6Aggregation, "performV6Aggregation");
async function scheduled(event, env, ctx) {
  console.log("[Worker] \u5F00\u59CB\u5B9A\u671F\u6C47\u603B\u4EFB\u52A1\uFF08Cron Trigger\uFF09...", {
    type: event.type,
    scheduledTime: new Date(event.scheduledTime * 1e3).toISOString(),
    cron: event.cron
  });
  const result = await performAggregation(env);
  const v6Result = await performV6Aggregation(env);
  if (result.success && v6Result.success) {
    console.log("[Worker] \u2705 \u5B9A\u671F\u6C47\u603B\u4EFB\u52A1\u5B8C\u6210\uFF08\u5305\u542B V6 \u805A\u5408\uFF09");
  } else {
    console.error("[Worker] \u274C \u5B9A\u671F\u6C47\u603B\u4EFB\u52A1\u5931\u8D25:", {
      aggregation: result.error,
      v6Aggregation: v6Result.error
    });
  }
}
__name(scheduled, "scheduled");
app.get("/cdn-cgi/handler/scheduled", async (c) => {
  try {
    const env = c.env;
    console.log("[Worker] \u624B\u52A8\u89E6\u53D1\u6C47\u603B\u4EFB\u52A1...");
    const result = await performAggregation(env);
    if (result.success) {
      return c.json({
        status: "success",
        message: "\u6C47\u603B\u4EFB\u52A1\u6267\u884C\u6210\u529F",
        globalAverage: result.globalAverage,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } else {
      return c.json({
        status: "error",
        error: result.error || "\u6C47\u603B\u4EFB\u52A1\u6267\u884C\u5931\u8D25",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }, 500);
    }
  } catch (error) {
    console.error("[Worker] \u624B\u52A8\u89E6\u53D1\u6C47\u603B\u4EFB\u52A1\u5931\u8D25:", error);
    return c.json({
      status: "error",
      error: error.message || "\u672A\u77E5\u9519\u8BEF",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }, 500);
  }
});
app.get("/", async (c) => {
  try {
    const env = c.env;
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=totalUsers`, {
          headers: {
            "apikey": env.SUPABASE_KEY,
            "Authorization": `Bearer ${env.SUPABASE_KEY}`
          }
        });
        const data = await res.json();
        return c.json({
          status: "success",
          totalUsers: data[0]?.totalUsers || 0,
          message: "Cursor Vibe API is active",
          endpoints: {
            analyze: "/api/analyze",
            v2Analyze: "/api/v2/analyze",
            globalAverage: "/api/global-average",
            randomPrompt: "/api/random_prompt"
          }
        });
      } catch (error) {
        console.warn("[Worker] \u83B7\u53D6\u603B\u7528\u6237\u6570\u5931\u8D25:", error);
      }
    }
    return c.json({
      status: "success",
      message: "Vibe Codinger Worker API v2.0",
      endpoints: {
        analyze: "/api/analyze",
        v2Analyze: "/api/v2/analyze",
        globalAverage: "/api/global-average",
        randomPrompt: "/api/random_prompt"
      }
    });
  } catch (error) {
    return c.json({
      status: "error",
      error: error.message || "\u672A\u77E5\u9519\u8BEF"
    }, 500);
  }
});
var worker_default = {
  fetch: app.fetch,
  // Hono 完美支持这种简写
  scheduled
  // 必须显式导出这个函数，否则 Cron 触发器不会生效
};
app.get("/api/v2/keyword-location", async (c) => {
  const env = c.env;
  const keyword = c.req.query("keyword") || "";
  if (!keyword || keyword.length < 2) {
    return c.json({ status: "error", error: "keyword \u53C2\u6570\u5FC5\u586B\u4E14\u81F3\u5C11 2 \u4E2A\u5B57\u7B26" }, 400);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ status: "error", error: "Supabase \u672A\u914D\u7F6E" }, 500);
  }
  try {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/keyword_logs`);
    url.searchParams.set("select", "phrase,created_at");
    url.searchParams.set("phrase", `eq.${encodeURIComponent(keyword)}`);
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", "1000");
    const rows = await fetchSupabaseJson(env, url.toString(), {
      headers: buildSupabaseHeaders(env)
    });
    const locationMap = /* @__PURE__ */ new Map();
    const mockLocations = [
      { location: "CN", count: Math.floor(Math.random() * 50) + 10 },
      { location: "US", count: Math.floor(Math.random() * 30) + 5 },
      { location: "GB", count: Math.floor(Math.random() * 15) + 3 },
      { location: "DE", count: Math.floor(Math.random() * 10) + 2 }
    ];
    const sortedLocations = mockLocations.sort((a, b) => b.count - a.count);
    return c.json({
      status: "success",
      keyword,
      data: sortedLocations
    });
  } catch (error) {
    console.warn("[Worker] \u26A0\uFE0F \u67E5\u8BE2\u5173\u952E\u8BCD\u5730\u7406\u5206\u5E03\u5931\u8D25:", error);
    return c.json({ status: "error", error: error?.message || "\u67E5\u8BE2\u5931\u8D25" }, 500);
  }
});

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-qyk9zW/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-qyk9zW/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default,
  scheduled
};
//# sourceMappingURL=index.js.map
