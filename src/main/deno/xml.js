var Deno = {
  errors:{
    // just fix for browser
    UnexpectedEof:class UnexpectedEof extends Error{}
  }
}
// utils/types.ts
var $XML = Symbol("x/xml");
var schema = {
  comment: "#comment",
  text: "#text",
  stylesheets: "$stylesheets",
  attribute: {
    prefix: "@"
  },
  property: {
    prefix: "@"
  },
  space: {
    name: "xml:space",
    preserve: "preserve"
  }
};
var SeekMode = Object.freeze({
  Current: Deno?.SeekMode?.Current ?? 0,
  Start: Deno?.SeekMode?.Start ?? 1,
  End: Deno?.SeekMode?.End ?? 2
});
var entities = {
  xml: {
    "&lt;": "<",
    "&gt;": ">",
    "&apos;": "'",
    "&quot;": '"',
    "&amp;": "&"
    //Keep last
  },
  char: {
    "&": "&amp;",
    //Keep first
    '"': "&quot;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&apos;"
  }
};
var tokens = {
  entity: {
    regex: {
      entities: /&#(?<hex>x?)(?<code>\d+);/g
    }
  },
  prolog: {
    start: "<?xml",
    end: "?>"
  },
  stylesheet: {
    start: "<?xml-stylesheet",
    end: "?>"
  },
  doctype: {
    start: "<!DOCTYPE",
    end: ">",
    elements: {
      start: "[",
      end: "]"
    },
    element: {
      start: "<!ELEMENT",
      end: ">",
      value: {
        start: "(",
        end: ")",
        regex: {
          end: { until: /\)/, bytes: 1 }
        }
      }
    }
  },
  comment: {
    start: "<!--",
    end: "-->",
    regex: {
      end: { until: /(?<!-)-->/, bytes: 4, length: 3 }
    }
  },
  cdata: {
    start: "<![CDATA[",
    end: "]]>",
    regex: {
      end: {
        until: /\]\]>/,
        bytes: 3
      }
    }
  },
  tag: {
    start: "<",
    end: ">",
    close: {
      start: "</",
      end: ">",
      self: "/",
      regex: {
        start: /<\//,
        end: /\/?>/
      }
    },
    attribute: {
      regex: {
        name: { until: /=/, bytes: 1 }
      }
    },
    regex: {
      name: { until: /[\s\/>]/, bytes: 1 },
      start: { until: /</, bytes: 1 }
    }
  },
  text: {
    regex: {
      end: { until: /(<\/)|(<!)/, bytes: 2 }
    }
  }
};

// utils/parser.ts
var Parser = class {
  /** Constructor */
  constructor(stream, options = {}) {
    this.#stream = stream;
    this.#options = options;
    this.#options.reviver ??= function({ value }) {
      return value;
    };
  }
  /** Parse document */
  parse() {
    return this.#document();
  }
  /** Options */
  #options;
  /** Debugger */
  #debug(path, string) {
    if (this.#options.debug) {
      console.debug(`${path.map((node) => node[$XML].name).join(" > ")} | ${string}`.trim());
    }
  }
  /** Document parser */
  #document() {
    const document = Object.defineProperty({}, $XML, {
      enumerable: false,
      writable: true,
      value: { cdata: [] }
    });
    const path = [];
    const comments = [];
    let root = false;
    let clean;
    this.#trim();
    try {
      while (true) {
        clean = true;
        if (this.#peek(tokens.comment.start)) {
          clean = false;
          comments.push(this.#comment({ path }));
          continue;
        }
        if (this.#peek(tokens.prolog.start) && !this.#peek(tokens.stylesheet.start)) {
          if (document.xml) {
            throw Object.assign(new SyntaxError("Multiple prolog declaration found"), { stack: false });
          }
          clean = false;
          Object.assign(document, this.#prolog({ path }));
          continue;
        }
        if (this.#peek(tokens.stylesheet.start)) {
          clean = false;
          const stylesheets = document[schema.stylesheets] ??= [];
          stylesheets.push(this.#stylesheet({ path }).stylesheet);
          continue;
        }
        if (this.#peek(tokens.doctype.start)) {
          if (document.doctype) {
            throw Object.assign(new SyntaxError("Multiple doctype declaration found"), { stack: false });
          }
          clean = false;
          Object.assign(document, this.#doctype({ path }));
          continue;
        }
        if (this.#peek(tokens.tag.start)) {
          if (root) {
            throw Object.assign(new SyntaxError("Multiple root elements found"), { stack: false });
          }
          clean = false;
          Object.assign(document, this.#node({ document, path }));
          this.#trim();
          root = true;
          continue;
        }
      }
    } catch (error) {
      if (error instanceof Deno.errors.UnexpectedEof && clean) {
        if (comments.length) {
          document[schema.comment] = comments;
        }
        return document;
      }
      throw error;
    }
  }
  /** Node parser */
  #node({ document, path }) {
    if (this.#options.progress) {
      this.#options.progress(this.#stream.cursor);
    }
    if (this.#peek(tokens.comment.start)) {
      return { [schema.comment]: this.#comment({ path }) };
    }
    return this.#tag({ document, path });
  }
  /** Prolog parser */
  #prolog({ path }) {
    this.#debug(path, "parsing prolog");
    const prolog = this.#make.node({ name: "xml", path });
    this.#consume(tokens.prolog.start);
    while (!this.#peek(tokens.prolog.end)) {
      Object.assign(prolog, this.#attribute({ path: [...path, prolog] }));
    }
    this.#consume(tokens.prolog.end);
    return { xml: prolog };
  }
  /** Stylesheet parser */
  #stylesheet({ path }) {
    this.#debug(path, "parsing stylesheet");
    const stylesheet = this.#make.node({ name: "xml-stylesheet", path });
    this.#consume(tokens.stylesheet.start);
    while (!this.#peek(tokens.stylesheet.end)) {
      Object.assign(stylesheet, this.#attribute({ path: [...path, stylesheet] }));
    }
    this.#consume(tokens.stylesheet.end);
    return { stylesheet };
  }
  /** Doctype parser */
  #doctype({ path }) {
    this.#debug(path, "parsing doctype");
    const doctype = this.#make.node({ name: "doctype", path });
    Object.defineProperty(doctype, $XML, { enumerable: false, writable: true });
    this.#consume(tokens.doctype.start);
    while (!this.#peek(tokens.doctype.end)) {
      if (this.#peek(tokens.doctype.elements.start)) {
        this.#consume(tokens.doctype.elements.start);
        while (!this.#peek(tokens.doctype.elements.end)) {
          Object.assign(doctype, this.#doctypeElement({ path }));
        }
        this.#consume(tokens.doctype.elements.end);
      } else {
        Object.assign(doctype, this.#property({ path }));
      }
    }
    this.#stream.consume({ content: tokens.doctype.end });
    return { doctype };
  }
  /** Doctype element parser */
  #doctypeElement({ path }) {
    this.#debug(path, "parsing doctype element");
    this.#consume(tokens.doctype.element.start);
    const element = Object.keys(this.#property({ path })).shift().substring(schema.property.prefix.length);
    this.#debug(path, `found doctype element "${element}"`);
    this.#consume(tokens.doctype.element.value.start);
    const value = this.#capture(tokens.doctype.element.value.regex.end);
    this.#consume(tokens.doctype.element.value.end);
    this.#debug(path, `found doctype element value "${value}"`);
    this.#consume(tokens.doctype.element.end);
    return { [element]: value };
  }
  /** Tag parser */
  #tag({ document, path }) {
    this.#debug(path, "parsing tag");
    const tag = this.#make.node({ path });
    this.#consume(tokens.tag.start);
    const name = this.#capture(tokens.tag.regex.name);
    Object.assign(tag[$XML], { name });
    this.#debug(path, `found tag "${name}"`);
    while (!tokens.tag.close.regex.end.test(this.#stream.peek(2))) {
      Object.assign(tag, this.#attribute({ path: [...path, tag] }));
    }
    let trim = true;
    if (tag[`${schema.attribute.prefix}${schema.space.name}`] === schema.space.preserve) {
      this.#debug([...path, tag], `${schema.space.name} is set to ${schema.space.preserve}`);
      trim = false;
    }
    const selfclosed = this.#peek(tokens.tag.close.self);
    if (selfclosed) {
      this.#debug(path, `tag "${name}" is self-closed`);
      this.#consume(tokens.tag.close.self);
    }
    this.#consume(tokens.tag.end, { trim });
    if (!selfclosed) {
      if (this.#peek(tokens.cdata.start) || !this.#peek(tokens.tag.start)) {
        Object.assign(tag, this.#text({ document, close: name, path: [...path, tag], trim }));
      } else {
        while (!tokens.tag.close.regex.start.test(this.#stream.peek(2))) {
          const child = this.#node({ document, path: [...path, tag] });
          const [key, value] = Object.entries(child).shift();
          if (Array.isArray(tag[key])) {
            ;
            tag[key].push(value);
            this.#debug([...path, tag], `add new child "${key}" to array`);
          } else if (key in tag) {
            const array = [tag[key], value];
            Object.defineProperty(array, $XML, { enumerable: false, writable: true });
            if (tag[key]?.[$XML]) {
              Object.assign(array, { [$XML]: tag[key][$XML] });
            }
            tag[key] = array;
            this.#debug([...path, tag], `multiple children named "${key}", using array notation`);
          } else {
            Object.assign(tag, child);
            this.#debug([...path, tag], `add new child "${key}"`);
          }
        }
      }
      this.#consume(tokens.tag.close.start);
      this.#consume(name);
      this.#consume(tokens.tag.close.end);
      this.#debug(path, `found closing tag for "${name}"`);
    }
    for (const [key] of Object.entries(tag).filter(([_, value]) => typeof value === "undefined")) {
      delete tag[key];
    }
    if (!Object.keys(tag).includes(schema.text)) {
      const children = Object.keys(tag).filter(
        (key) => !key.startsWith(schema.attribute.prefix) && key !== schema.text
      );
      if (!children.length) {
        this.#debug(path, `tag "${name}" has implictely obtained a text node as it has no children but has attributes`);
        tag[schema.text] = this.#revive({ key: schema.text, value: "", tag });
      }
    }
    if ((this.#options.flatten ?? true) && Object.keys(tag).includes(schema.text) && Object.keys(tag).length === 1) {
      this.#debug(path, `tag "${name}" has been implicitely flattened as it only has a text node`);
      return { [name]: tag[schema.text] };
    }
    return { [name]: tag };
  }
  /** Attribute parser */
  #attribute({ path }) {
    this.#debug(path, "parsing attribute");
    const attribute = this.#capture(tokens.tag.attribute.regex.name);
    this.#debug(path, `found attribute "${attribute}"`);
    this.#consume("=");
    const quote = this.#stream.peek();
    this.#consume(quote);
    const value = this.#capture({ until: new RegExp(quote), bytes: quote.length });
    this.#consume(quote);
    this.#debug(path, `found attribute value "${value}"`);
    return {
      [`${schema.attribute.prefix}${attribute}`]: this.#revive({
        key: `${schema.attribute.prefix}${attribute}`,
        value,
        tag: path.at(-1)
      })
    };
  }
  /** Property parser */
  #property({ path }) {
    this.#debug(path, "parsing property");
    let property;
    const quote = this.#stream.peek();
    if (/["']/.test(quote)) {
      this.#consume(quote);
      property = this.#capture({ until: new RegExp(quote), bytes: 1 });
      this.#consume(quote);
    } else {
      property = this.#capture({ until: /[\s>]/, bytes: 1 });
    }
    this.#debug(path, `found property ${property}`);
    return { [`${schema.property.prefix}${property}`]: true };
  }
  /** Text parser */
  #text({ document, close, path, trim }) {
    this.#debug(path, "parsing text");
    const tag = this.#make.node({ name: schema.text, path });
    let text = "";
    const comments = [];
    while (this.#peek(tokens.cdata.start) || !this.#peeks([tokens.tag.close.start, close, tokens.tag.close.end])) {
      if (this.#peek(tokens.cdata.start)) {
        const cpath = path.map((node) => node[$XML].name);
        document[$XML].cdata?.push(cpath);
        this.#debug(path, `text is specified as cdata, storing path >${cpath.join(">")} in document metadata`);
        text += this.#cdata({ path: [...path, tag] });
      } else if (this.#peek(tokens.comment.start)) {
        comments.push(this.#comment({ path: [...path, tag] }));
      } else {
        text += this.#capture({ ...tokens.text.regex.end }, { trim });
        if (this.#peek(tokens.cdata.start) || this.#peek(tokens.comment.start)) {
          continue;
        }
        if (!this.#peeks([tokens.tag.close.start, close, tokens.tag.close.end])) {
          text += tokens.tag.close.start;
          this.#consume(tokens.tag.close.start);
        }
      }
    }
    this.#debug(path, `parsed text "${text}"`);
    if (comments.length) {
      this.#debug(path, `parsed comments ${JSON.stringify(comments)}`);
    }
    Object.assign(tag, {
      [schema.text]: this.#revive({ key: schema.text, value: trim ? text.trim() : text, tag: path.at(-1) }),
      ...comments.length ? { [schema.comment]: comments } : {}
    });
    return tag;
  }
  /** CDATA parser */
  #cdata({ path }) {
    this.#debug(path, "parsing cdata");
    this.#consume(tokens.cdata.start);
    const data = this.#capture(tokens.cdata.regex.end);
    this.#consume(tokens.cdata.end);
    return data;
  }
  /** Comment parser */
  #comment({ path }) {
    this.#debug(path, "parsing comment");
    this.#consume(tokens.comment.start);
    const comment = this.#capture(tokens.comment.regex.end).trim();
    this.#consume(tokens.comment.end);
    return comment;
  }
  //================================================================================
  /** Reviver */
  #revive({ key, value, tag }) {
    return this.#options.reviver.call(tag, {
      key,
      tag: tag[$XML].name,
      properties: !(key.startsWith(schema.attribute.prefix) || key.startsWith(schema.property.prefix)) ? { ...tag } : null,
      value: (() => {
        switch (true) {
          case ((this.#options.emptyToNull ?? true) && /^\s*$/.test(value)):
            return null;
          case ((this.#options.reviveBooleans ?? true) && /^(?:true|false)$/i.test(value)):
            return /^true$/i.test(value);
          case (this.#options.reviveNumbers ?? true): {
            const num = Number(value);
            if (Number.isFinite(num)) {
              return num;
            }
          }
          default:
            value = value.replace(
              tokens.entity.regex.entities,
              (_, hex, code) => String.fromCharCode(parseInt(code, hex ? 16 : 10))
            );
            for (const [entity, character] of Object.entries(entities.xml)) {
              value = value.replaceAll(entity, character);
            }
            return value;
        }
      })()
    });
  }
  //================================================================================
  /** Makers */
  #make = {
    /** Node maker */
    node({ name = "", path = [] }) {
      const node = { [$XML]: { name, parent: path[path.length - 1] ?? null } };
      Object.defineProperty(node, $XML, { enumerable: false, writable: true });
      return node;
    }
  };
  //================================================================================
  /** Text stream */
  #stream;
  /** Peek and validate against token */
  #peek(token) {
    return this.#stream.peek(token.length) === token;
  }
  /** Peek and validate against tokens */
  #peeks(tokens2) {
    let offset = 0;
    for (let i = 0; i < tokens2.length; i++) {
      const token = tokens2[i];
      while (true) {
        if (/\s/.test(this.#stream.peek(1, offset))) {
          offset++;
          continue;
        }
        if (this.#stream.peek(token.length, offset) === token) {
          offset += token.length;
          break;
        }
        return false;
      }
    }
    return true;
  }
  /** Consume token */
  #consume(token, { trim } = {}) {
    return this.#stream.consume({ content: token, trim });
  }
  /** Capture until next token */
  #capture(token, { trim } = {}) {
    return this.#stream.capture({ ...token, trim });
  }
  /** Trim stream */
  #trim() {
    return this.#stream.trim();
  }
};

// utils/stream.ts
var Stream = class {
  /** Constructor */
  constructor(content) {
    this.#content = content;
  }
  /** Text decodeer */
  #decoder = new TextDecoder();
  /** Text encoder */
  #encoder = new TextEncoder();
  /** Content */
  #content;
  /** Cursor position */
  get cursor() {
    return this.#content.seekSync(0, SeekMode.Current);
  }
  /** Peek next bytes (cursor is replaced at current position after reading) */
  peek(bytes = 1, offset = 0) {
    const buffer = new Uint8Array(bytes);
    const cursor = this.cursor;
    if (offset) {
      this.#content.seekSync(offset, SeekMode.Current);
    }
    if (this.#content.readSync(buffer)) {
      this.#content.seekSync(cursor, SeekMode.Start);
      return this.#decoder.decode(buffer);
    }
    throw new Deno.errors.UnexpectedEof();
  }
  /** Read next bytes (cursor is moved after reading) */
  read(bytes = 1) {
    const buffer = new Uint8Array(bytes);
    if (this.#content.readSync(buffer)) {
      return buffer;
    }
    throw new Deno.errors.UnexpectedEof();
  }
  /** Capture next bytes until matching regex sequence (length can be used for regex with lookbehind) */
  capture({ until, bytes, trim = true, length = bytes }) {
    if (trim) {
      this.trim();
    }
    const buffer = [];
    while (!until.test(this.peek(bytes))) {
      buffer.push(this.read(1)[0]);
    }
    if (bytes !== length) {
      buffer.push(...this.read(bytes - length));
    }
    if (trim) {
      this.trim();
    }
    return this.#decoder.decode(Uint8Array.from(buffer));
  }
  /** Consume next bytes ensuring that content is matching */
  consume({ content, trim = true }) {
    if (trim) {
      this.trim();
    }
    const bytes = this.#encoder.encode(content).length;
    if (content === this.peek(bytes)) {
      this.read(bytes);
      if (trim) {
        this.trim();
      }
      return;
    }
    throw Object.assign(
      new SyntaxError(`Expected next sequence to be "${content}", got "${this.peek(bytes)}" instead`),
      { stack: false }
    );
  }
  /** Trim content */
  trim() {
    try {
      while (/\s/.test(this.peek())) {
        this.read(1);
      }
    } catch (error) {
      if (error instanceof Deno.errors.UnexpectedEof) {
        return;
      }
      throw error;
    }
  }
};

// utils/streamable.ts
var Streamable = class {
  /** Constructor */
  constructor(string) {
    this.#buffer = new TextEncoder().encode(string);
  }
  /** Buffer */
  #buffer;
  /** Cursor */
  #cursor = 0;
  /** Read bytes */
  readSync(buffer) {
    const bytes = this.#buffer.slice(this.#cursor, this.#cursor + buffer.length);
    buffer.set(bytes);
    this.#cursor = Math.min(this.#cursor + bytes.length, this.#buffer.length);
    return bytes.length || null;
  }
  /** Set cursor position */
  seekSync(offset, whence) {
    switch (whence) {
      case SeekMode.Start:
        this.#cursor = offset;
        break;
      case SeekMode.Current:
        this.#cursor += offset;
        break;
      case SeekMode.End:
        this.#cursor = this.#buffer.length + offset;
        break;
    }
    return this.#cursor;
  }
};

// parse.ts
function parse(content, options) {
  if (typeof content === "string") {
    content = new Streamable(content);
  }
  return new Parser(new Stream(content), options).parse();
}

// utils/stringifier.ts
var Stringifier = class {
  /** Constructor */
  constructor(document, options = {}) {
    this.#document = document;
    this.#options = options;
    this.#options.replacer ??= function({ value }) {
      return value;
    };
  }
  /** Stringify document */
  stringify() {
    const document = this.#make.extraction(this.#document);
    if (document.raw.xml) {
      this.#prolog(document);
    }
    if (document.raw[schema.stylesheets]) {
      this.#stylesheet(document);
    }
    if (document.raw.doctype) {
      this.#doctype(document);
    }
    this.#tag({ document: document.raw, path: [], name: "", ...document });
    return this.#result.trim();
  }
  /** Options */
  #options;
  /** Document */
  #document;
  /** Debugger */
  #debug(path, string) {
    if (this.#options.debug) {
      console.debug(`${path.join(" > ")} | ${string}`.trim());
    }
  }
  /** Prolog stringifier */
  #prolog({ raw: node }) {
    this.#debug([], "stringifying prolog");
    const attributes = this.#attributes({ tag: "prolog", ...this.#make.extraction(node.xml) });
    this.#write(`${tokens.prolog.start}${attributes}${tokens.prolog.end}`);
  }
  /** Stylesheet stringifier */
  #stylesheet({ raw: node }) {
    this.#debug([], "stringifying stylesheets");
    for (const stylesheet of node[schema.stylesheets]) {
      const attributes = this.#attributes({ tag: "stylesheet", ...this.#make.extraction(stylesheet) });
      this.#write(`${tokens.stylesheet.start}${attributes}${tokens.stylesheet.end}`);
    }
  }
  /** Doctype stringifier */
  #doctype({ raw: node }) {
    this.#debug([], "stringifying doctype");
    const { raw: doctype, attributes, children: elements } = this.#make.extraction(node.doctype);
    this.#write(`${tokens.doctype.start}${this.#properties({ attributes })}`, {
      newline: !!elements.length
    });
    if (elements.length) {
      this.#debug([], "stringifying doctype elements");
      this.#down();
      this.#write(tokens.doctype.elements.start);
      this.#down();
      for (const key of elements) {
        this.#debug([], `stringifying doctype elements ${key}`);
        const value = `${tokens.doctype.element.value.start}${doctype[key]}${tokens.doctype.element.value.end}`;
        this.#write(
          `${tokens.doctype.element.start} ${this.#quote(key, { optional: true })} ${value} ${tokens.doctype.element.end}`
        );
      }
      this.#up();
      this.#write(tokens.doctype.elements.end);
      this.#up();
    }
    this.#write(tokens.doctype.end);
  }
  /** Tag stringifier */
  #tag({ document, path, name, raw: node, text: content, comments, attributes, children }) {
    if (name) {
      this.#debug(path, `stringifying tag ${name}`);
    }
    if (this.#options.progress) {
      this.#options.progress(this.#result.length);
    }
    const selfclosed = content === null && !comments.length && !children.length;
    let inline = false;
    if (name) {
      this.#write(
        `${tokens.tag.start}${name}${this.#attributes({ raw: node, attributes, tag: name })}${selfclosed ? tokens.tag.close.self : ""}${tokens.tag.end}`
      );
      this.#down();
    }
    if (!selfclosed) {
      if (["string", "boolean", "number", "undefined"].includes(typeof content) || content === null) {
        let cdata = false;
        if (document[$XML]?.cdata?.find((cpath) => cpath.join(">") === path.join(">"))) {
          this.#debug(path, `stringifying text content`);
          cdata = true;
        }
        this.#debug(path, `stringifying text content`);
        inline = this.#text({
          path,
          text: content,
          tag: name,
          properties: Object.fromEntries(
            attributes.map((attribute) => [attribute.substring(schema.attribute.prefix.length), node[attribute]])
          ),
          cdata
        });
      }
      if (comments.length) {
        this.#debug(path, `stringifying comments`);
        const commentArr = Array.isArray(comments) ? comments : [comments];
        for (const comment of commentArr) {
          this.#write("\n", { newline: false, indent: false });
          this.#comment({ text: comment, tag: name });
        }
      }
      if (children.length) {
        this.#debug(path, `stringifying children`);
        this.#write("\n", { newline: false, indent: false });
        const handle = ({ child, name: name2 }) => {
          switch (true) {
            case Array.isArray(child): {
              for (const value of child) {
                handle({ child: value, name: name2 });
              }
              break;
            }
            case (typeof child === "object" && !!child): {
              this.#tag({ document, name: name2, path: [...path, name2], ...this.#make.extraction(child) });
              break;
            }
            default: {
              this.#tag({
                document,
                name: name2,
                path: [...path, name2],
                ...this.#make.extraction({ [schema.text]: child })
              });
              break;
            }
          }
        };
        for (const name2 of children) {
          const child = node[name2];
          handle({ child, name: name2 });
        }
        inline = false;
      }
    }
    if (name) {
      this.#up();
      if (!selfclosed) {
        this.#write(`${tokens.tag.close.start}${name}${tokens.tag.close.end}`, { indent: !inline });
      }
    }
  }
  /** Comment stringifier */
  #comment({ text, tag }) {
    const comment = this.#replace({ value: text, key: schema.comment, tag, properties: null });
    this.#write(`${tokens.comment.start} ${comment} ${tokens.comment.end}`, { newline: false });
  }
  /** Text stringifier */
  #text({ path, text, tag, properties, cdata }) {
    if (cdata) {
      text = `${tokens.cdata.start}${text}${tokens.cdata.end}`;
    }
    const lines = this.#replace({ value: text, key: schema.text, tag, properties, escape: !cdata }).split("\n");
    let trim = true;
    if (properties[schema.space.name] === schema.space.preserve) {
      this.#debug(path, `${schema.space.name} is set to ${schema.space.preserve}`);
      trim = false;
    }
    const inline = lines.length <= 1;
    if (inline) {
      this.#trim();
    }
    for (const line of lines) {
      this.#write(trim ? line.trimStart() : line, { indent: !inline, newline: !inline });
    }
    return inline;
  }
  //================================================================================
  /** Attributes stringifier */
  #attributes({ raw: node, attributes, tag }) {
    const stringified = attributes.map(
      (key) => `${key.substring(schema.attribute.prefix.length)}=${this.#quote(this.#replace({ key, value: node[key], tag, properties: null }))}`
    ).join(" ");
    return stringified.length ? ` ${stringified}` : "";
  }
  /** Properties stringifier */
  #properties({ attributes }) {
    const stringified = attributes.map((key) => `${this.#quote(key.substring(schema.property.prefix.length), { optional: true })}`).join(" ");
    return stringified.length ? ` ${stringified}` : "";
  }
  //================================================================================
  /** Replacer */
  #replace({ key, value, tag, properties, escape = true }) {
    return `${this.#options.replacer.call(null, {
      key,
      tag,
      properties,
      value: (() => {
        switch (true) {
          case ((this.#options.nullToEmpty ?? true) && value === null):
            return "";
          default: {
            if (escape) {
              for (const [char, entity] of Object.entries(entities.char)) {
                value = `${value}`.replaceAll(char, entity);
              }
            }
          }
        }
        return `${value}`;
      })()
    })}`;
  }
  //================================================================================
  /** Result */
  #result = "";
  /** Write text */
  #write(text, { newline = true, indent = true } = {}) {
    this.#result += `${`${indent ? " ".repeat((this.#options?.indentSize ?? 2) * this.#depth) : ""}`}${text}${newline ? "\n" : ""}`;
  }
  /** Trim text */
  #trim() {
    this.#result = this.#result.trim();
  }
  /** Depth */
  #depth = 0;
  /** Go down */
  #down() {
    this.#depth++;
  }
  /** Go up */
  #up() {
    this.#depth--;
    this.#depth = Math.max(0, this.#depth);
  }
  /** Quoter */
  #quote(content, { optional = false } = {}) {
    if (optional) {
      if (/^[\w_]+$/i.test(`${content}`)) {
        return `${content}`;
      }
    }
    return `"${`${content}`.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  //================================================================================
  /** Makers */
  #make = {
    /** Extract content (text), attributes and children nodes */
    extraction(node) {
      const keys = Object.keys(node ?? {});
      return {
        raw: node,
        text: node?.[schema.text] ?? null,
        comments: node?.[schema.comment] ?? [],
        attributes: keys.filter(
          (key) => key.startsWith(schema.attribute.prefix) || key.startsWith(schema.property.prefix)
        ),
        children: keys.filter(
          (key) => ![schema.text, schema.comment, schema.stylesheets, "xml", "doctype"].includes(key) && !(key.startsWith(schema.attribute.prefix) || key.startsWith(schema.property.prefix))
        ),
        meta: node?.[$XML] ?? {}
      };
    }
  };
};

// stringify.ts
function stringify(content, options) {
  return new Stringifier(content, options).stringify();
}
export {
  $XML,
  parse,
  stringify
};
