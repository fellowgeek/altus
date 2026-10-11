/**
 * Altus Personal Cloud - Markdown Renderer
 *
 * Dependency-free Markdown to HTML renderer used by the file previewer.
 * Supports the CommonMark core (headings, paragraphs, emphasis, code spans,
 * fenced and indented code, blockquotes, nested lists, links, images,
 * reference links, thematic breaks) plus GitHub Flavored Markdown extensions
 * (tables, task lists, strikethrough, bare URL autolinks, alerts).
 *
 * Security: raw HTML is permitted only for a small whitelist of tags and the
 * final output is always passed through a DOM-based sanitizer that strips
 * scripts, event handlers, styles and unsafe URL schemes.
 *
 * Exposes: window.AltusMarkdown.render(source) -> sanitized HTML string
 */

(function () {
  'use strict';

  // Block-level HTML tags that start a raw HTML block when found at line start.
  const BLOCK_HTML_TAGS = new Set([
    'address', 'article', 'aside', 'blockquote', 'center', 'details', 'dd', 'div', 'dl', 'dt',
    'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li',
    'main', 'nav', 'ol', 'p', 'picture', 'pre', 'section', 'summary', 'table', 'tbody', 'td',
    'tfoot', 'th', 'thead', 'tr', 'ul', 'img', 'a', 'br'
  ]);

  // Tags retained by the sanitizer. Anything else is unwrapped (content kept).
  const ALLOWED_TAGS = new Set([
    'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'dd', 'del', 'details',
    'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
    'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'picture', 'pre', 's', 'samp', 'section',
    'small', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td',
    'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'var'
  ]);

  // Tags removed together with all of their content.
  const DROPPED_TAGS = new Set([
    'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript',
    'template', 'form', 'input', 'button', 'textarea', 'select', 'option', 'link', 'meta',
    'base', 'svg', 'math', 'audio', 'video', 'source', 'track', 'canvas', 'title', 'head'
  ]);

  const ALLOWED_ATTRS = {
    '*': ['title', 'align', 'lang', 'dir'],
    a: ['href'],
    img: ['src', 'alt', 'width', 'height'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
    ol: ['start', 'reversed'],
    details: ['open'],
    code: ['data-lang']
  };

  const LIST_RE = /^( {0,3})([*+-]|\d{1,9}[.)])( +|$)(.*)$/;
  const FENCE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;
  const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
  const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
  const HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
  const QUOTE_RE = /^ {0,3}> ?/;
  const TABLE_DELIM_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
  const HTML_BLOCK_RE = /^ {0,3}<\/?([a-zA-Z][\w-]*)(?:[\s/>]|$)/;
  const REF_DEF_RE = /^ {0,3}\[([^\]]+)\]:[ \t]*<?([^\s>]+)>?(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/;
  const ALERT_ICONS = {
    NOTE: 'info',
    TIP: 'lightbulb',
    IMPORTANT: 'priority_high',
    WARNING: 'warning',
    CAUTION: 'report'
  };

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const isBlank = (line) => /^[ \t]*$/.test(line);
  const leadingSpaces = (line) => line.match(/^ */)[0].length;

  /**
   * Returns a URL when it uses a safe scheme, otherwise null.
   * Relative paths are rejected (they cannot resolve inside the SPA) except
   * for in-document anchors.
   */
  function safeUrl(rawUrl, { image = false } = {}) {
    const url = String(rawUrl || '').trim();
    if (!url) return null;
    const scheme = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if (!scheme) {
      return url.startsWith('#') ? url : null;
    }
    const name = scheme[1].toLowerCase();
    if (name === 'http' || name === 'https') return url;
    if (!image && name === 'mailto') return url;
    if (image && /^data:image\/(png|jpe?g|gif|webp|avif|bmp);/i.test(url)) return url;
    return null;
  }

  function slugify(html) {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&[a-z#0-9]+;/gi, '')
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s+/g, '-');
  }

  function splitTableRow(line) {
    let row = line.trim();
    if (row.startsWith('|')) row = row.slice(1);
    if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
    return row.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
  }

  class Renderer {
    constructor() {
      this.refs = new Map();
      this.slugCounts = new Map();
    }

    render(source) {
      const text = String(source || '')
        .replace(/^\uFEFF/, '')
        .replace(/\u0000/g, '')
        .replace(/\r\n?/g, '\n')
        .replace(/\t/g, '    ');

      // Strip YAML front matter.
      const body = text.replace(/^---\n[\s\S]*?\n(?:---|\.\.\.)\n/, '');

      // Collect reference-style link definitions outside of code fences.
      const lines = [];
      let fence = null;
      for (const line of body.split('\n')) {
        if (fence) {
          const close = line.match(FENCE_CLOSE_RE);
          if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
          lines.push(line);
          continue;
        }
        const open = line.match(FENCE_RE);
        if (open) {
          fence = open[1];
          lines.push(line);
          continue;
        }
        const ref = line.match(REF_DEF_RE);
        if (ref && !ref[1].startsWith('^')) {
          this.refs.set(ref[1].trim().toLowerCase(), {
            url: ref[2],
            title: ref[3] ?? ref[4] ?? ref[5] ?? ''
          });
          continue;
        }
        lines.push(line);
      }

      return this.blocks(lines, false);
    }

    isHtmlBlockStart(line) {
      if (/^ {0,3}<!--/.test(line)) return true;
      const m = line.match(HTML_BLOCK_RE);
      return !!(m && BLOCK_HTML_TAGS.has(m[1].toLowerCase()));
    }

    isBlockStart(line) {
      return FENCE_RE.test(line) ||
        ATX_RE.test(line) ||
        HR_RE.test(line) ||
        QUOTE_RE.test(line) ||
        this.isHtmlBlockStart(line);
    }

    blocks(lines, tight) {
      const out = [];
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];

        if (isBlank(line)) {
          i++;
          continue;
        }

        // Fenced code block
        const fm = line.match(FENCE_RE);
        if (fm) {
          const fence = fm[1];
          const lang = fm[2] || '';
          const indentRe = new RegExp(`^ {0,${leadingSpaces(line)}}`);
          const code = [];
          i++;
          while (i < lines.length) {
            const close = lines[i].match(FENCE_CLOSE_RE);
            if (close && close[1][0] === fence[0] && close[1].length >= fence.length) {
              i++;
              break;
            }
            code.push(lines[i].replace(indentRe, ''));
            i++;
          }
          out.push(this.codeBlock(code.join('\n'), lang));
          continue;
        }

        // Indented code block
        if (/^ {4,}\S/.test(line)) {
          const code = [];
          while (i < lines.length && (/^ {4}/.test(lines[i]) || isBlank(lines[i]))) {
            code.push(lines[i].slice(4));
            i++;
          }
          while (code.length && isBlank(code[code.length - 1])) code.pop();
          out.push(this.codeBlock(code.join('\n'), ''));
          continue;
        }

        // ATX heading
        const hm = line.match(ATX_RE);
        if (hm) {
          out.push(this.heading(hm[1].length, hm[2] || ''));
          i++;
          continue;
        }

        // Thematic break
        if (HR_RE.test(line)) {
          out.push('<hr>');
          i++;
          continue;
        }

        // Blockquote and GitHub-style alerts
        if (QUOTE_RE.test(line)) {
          const quoted = [];
          while (i < lines.length && !isBlank(lines[i])) {
            if (QUOTE_RE.test(lines[i])) {
              quoted.push(lines[i].replace(QUOTE_RE, ''));
            } else if (!this.isBlockStart(lines[i]) && !LIST_RE.test(lines[i])) {
              quoted.push(lines[i]); // Lazy continuation
            } else {
              break;
            }
            i++;
          }
          out.push(this.blockquote(quoted));
          continue;
        }

        // List
        if (LIST_RE.test(line)) {
          const result = this.list(lines, i);
          out.push(result.html);
          i = result.next;
          continue;
        }

        // Raw HTML block (sanitized afterwards) or HTML comment
        if (this.isHtmlBlockStart(line)) {
          if (/^ {0,3}<!--/.test(line)) {
            while (i < lines.length) {
              const done = lines[i].includes('-->');
              i++;
              if (done) break;
            }
            continue;
          }
          const html = [];
          while (i < lines.length && !isBlank(lines[i])) {
            html.push(lines[i]);
            i++;
          }
          out.push(html.join('\n'));
          continue;
        }

        // Table
        if (line.includes('|') && i + 1 < lines.length && TABLE_DELIM_RE.test(lines[i + 1])) {
          const result = this.table(lines, i);
          if (result) {
            out.push(result.html);
            i = result.next;
            continue;
          }
        }

        // Paragraph, with setext heading detection
        const para = [line];
        let setext = 0;
        i++;
        while (i < lines.length) {
          const next = lines[i];
          if (isBlank(next)) break;
          if (/^ {0,3}=+[ \t]*$/.test(next)) { setext = 1; i++; break; }
          if (/^ {0,3}-+[ \t]*$/.test(next)) { setext = 2; i++; break; }
          if (this.isBlockStart(next) || LIST_RE.test(next)) break;
          if (next.includes('|') && i + 1 < lines.length && TABLE_DELIM_RE.test(lines[i + 1])) break;
          para.push(next);
          i++;
        }

        const content = para.map(l => l.replace(/^ +/, '')).join('\n');
        if (setext) {
          out.push(this.heading(setext, content));
        } else if (tight) {
          out.push(this.inline(content));
        } else {
          out.push(`<p>${this.inline(content)}</p>`);
        }
      }

      return out.join('\n');
    }

    codeBlock(code, lang) {
      const label = lang ? `<span class="md-code-lang">${esc(lang)}</span>` : '';
      return `<div class="md-code-block">${label}<pre class="md-pre"><code data-lang="${esc(lang)}">${esc(code)}</code></pre></div>`;
    }

    blockquote(quoted) {
      const alert = quoted.length ? quoted[0].match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i) : null;
      if (!alert) {
        return `<blockquote>${this.blocks(quoted, false)}</blockquote>`;
      }
      const type = alert[1].toUpperCase();
      const label = type.charAt(0) + type.slice(1).toLowerCase();
      return `<div class="md-alert md-alert-${type.toLowerCase()}">` +
        `<p class="md-alert-title"><span class="material-symbols-outlined">${ALERT_ICONS[type]}</span>${label}</p>` +
        `${this.blocks(quoted.slice(1), false)}</div>`;
    }

    heading(level, rawText) {
      const html = this.inline(rawText.trim());
      let slug = slugify(html) || 'section';
      const count = this.slugCounts.get(slug) || 0;
      this.slugCounts.set(slug, count + 1);
      if (count) slug = `${slug}-${count}`;
      return `<h${level} id="md-${esc(slug)}">${html}</h${level}>`;
    }

    list(lines, start) {
      const first = lines[start].match(LIST_RE);
      const ordered = /\d/.test(first[2]);
      const delimiter = first[2].slice(-1);
      const startNum = ordered ? parseInt(first[2], 10) : 1;
      const items = [];
      let loose = false;
      let i = start;

      while (i < lines.length) {
        const m = lines[i].match(LIST_RE);
        if (!m || HR_RE.test(lines[i])) break;
        if (/\d/.test(m[2]) !== ordered || m[2].slice(-1) !== delimiter) break;

        const indent = m[1].length;
        const spaces = m[3].length;
        const contentIndent = indent + m[2].length + (spaces === 0 || spaces > 4 ? 1 : spaces);
        const itemLines = [m[4]];
        let sawBlank = false;
        i++;

        while (i < lines.length) {
          const next = lines[i];
          if (isBlank(next)) {
            itemLines.push('');
            sawBlank = true;
            i++;
            continue;
          }
          const lead = leadingSpaces(next);
          if (lead >= contentIndent || (lead > indent && LIST_RE.test(next))) {
            itemLines.push(next.slice(Math.min(lead, contentIndent)));
            sawBlank = false;
            i++;
            continue;
          }
          if (sawBlank || LIST_RE.test(next) || this.isBlockStart(next)) break;
          itemLines.push(next.trim()); // Lazy paragraph continuation
          i++;
        }

        let trailingBlank = false;
        while (itemLines.length && isBlank(itemLines[itemLines.length - 1])) {
          itemLines.pop();
          trailingBlank = true;
        }
        if (itemLines.some(isBlank)) loose = true;

        const nextIsItem = i < lines.length && LIST_RE.test(lines[i]);
        if (trailingBlank && nextIsItem) loose = true;
        items.push(itemLines);
        if (trailingBlank && !nextIsItem) break;
      }

      let hasTasks = false;
      const itemsHtml = items.map(itemLines => {
        const tm = (itemLines[0] || '').match(/^\[([ xX])\](?:[ \t]+|$)/);
        if (!tm) {
          return `<li>${this.blocks(itemLines, !loose)}</li>`;
        }
        hasTasks = true;
        const done = tm[1] !== ' ';
        itemLines[0] = itemLines[0].slice(tm[0].length);
        const icon = done ? 'check_box' : 'check_box_outline_blank';
        return `<li class="md-task-item${done ? ' md-task-done' : ''}">` +
          `<span class="material-symbols-outlined md-task-box">${icon}</span>` +
          `<div class="md-task-body">${this.blocks(itemLines, !loose)}</div></li>`;
      }).join('\n');

      const tag = ordered ? 'ol' : 'ul';
      const cls = hasTasks ? ' class="md-task-list"' : '';
      const startAttr = ordered && startNum !== 1 ? ` start="${startNum}"` : '';
      return { html: `<${tag}${cls}${startAttr}>\n${itemsHtml}\n</${tag}>`, next: i };
    }

    table(lines, start) {
      const header = splitTableRow(lines[start]);
      const aligns = splitTableRow(lines[start + 1]).map(cell => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        return '';
      });
      if (aligns.length !== header.length) return null;

      const cell = (tag, text, idx) => {
        const cls = aligns[idx] ? ` class="md-align-${aligns[idx]}"` : '';
        return `<${tag}${cls}>${this.inline(text || '')}</${tag}>`;
      };

      const rows = [];
      let i = start + 2;
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|') && !this.isBlockStart(lines[i])) {
        const cells = splitTableRow(lines[i]);
        rows.push(`<tr>${header.map((_, idx) => cell('td', cells[idx], idx)).join('')}</tr>`);
        i++;
      }

      const thead = `<thead><tr>${header.map((h, idx) => cell('th', h, idx)).join('')}</tr></thead>`;
      const tbody = rows.length ? `<tbody>${rows.join('')}</tbody>` : '';
      return { html: `<div class="md-table-wrap"><table>${thead}${tbody}</table></div>`, next: i };
    }

    link(url, innerHtml, title) {
      const href = safeUrl(url);
      const titleAttr = title ? ` title="${esc(title)}"` : '';
      if (!href) return `<span class="md-link-inert"${titleAttr}>${innerHtml}</span>`;
      return `<a href="${esc(href)}"${titleAttr}>${innerHtml}</a>`;
    }

    image(url, alt, title) {
      const src = safeUrl(url, { image: true });
      const titleAttr = title ? ` title="${esc(title)}"` : '';
      if (!src) {
        return `<span class="md-image-missing"${titleAttr}><span class="material-symbols-outlined">image</span>${esc(alt || 'Image')}</span>`;
      }
      return `<img src="${esc(src)}" alt="${esc(alt)}"${titleAttr}>`;
    }

    resolveRef(key) {
      return this.refs.get(String(key || '').trim().toLowerCase()) || null;
    }

    inline(src) {
      const stash = [];
      const put = (html) => `\u0000${stash.push(html) - 1}\u0000`;
      let s = src;

      // Backslash escapes
      s = s.replace(/\\([\\`*_{}[\]()#+\-.!|~<>"'])/g, (_, ch) => put(esc(ch)));

      // Code spans
      s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, ticks, code) => {
        const flat = code.replace(/\n/g, ' ');
        const trimmed = /^ [\s\S]* $/.test(flat) && flat.trim() ? flat.slice(1, -1) : flat;
        return put(`<code>${esc(trimmed)}</code>`);
      });

      // Angle-bracket autolinks
      s = s.replace(/<(https?:\/\/[^\s<>]+)>/gi, (_, url) => put(this.link(url, esc(url))));
      s = s.replace(/<([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)>/g, (_, mail) => put(this.link(`mailto:${mail}`, esc(mail))));

      // Whitelisted inline HTML tags (sanitized afterwards)
      s = s.replace(/<\/?(?:a|abbr|b|br|code|del|em|i|img|ins|kbd|mark|s|samp|small|span|strong|sub|sup|u|var)(?:\s[^<>]*)?\/?>/gi, (tag) => put(tag));

      // Images
      s = s.replace(/!\[([^\]]*)\]\(\s*<?([^\s)>]*)>?(?:\s+["']([^"']*)["'])?\s*\)/g,
        (_, alt, url, title) => put(this.image(url, alt, title)));
      s = s.replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (match, alt, ref) => {
        const def = this.resolveRef(ref || alt);
        return def ? put(this.image(def.url, alt, def.title)) : match;
      });

      // Links: inline, full reference, and shortcut reference forms
      s = s.replace(/\[((?:[^[\]]|\[[^\]]*\])+)\]\(\s*<?([^\s)>]*)>?(?:\s+["']([^"']*)["'])?\s*\)/g,
        (_, text, url, title) => put(this.link(url, this.format(esc(text)), title)));
      s = s.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, text, ref) => {
        const def = this.resolveRef(ref || text);
        return def ? put(this.link(def.url, this.format(esc(text)), def.title)) : match;
      });
      s = s.replace(/\[([^\]]+)\](?![(:[])/g, (match, text) => {
        const def = this.resolveRef(text);
        return def ? put(this.link(def.url, this.format(esc(text)), def.title)) : match;
      });

      // Bare URLs
      s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>\u0000]*[^\s<>\u0000.,:;"')\]!?])/g,
        (_, pre, url) => pre + put(this.link(url, esc(url))));

      s = this.format(esc(s));

      // Restore stashed fragments (they may themselves contain placeholders)
      let guard = 0;
      while (s.includes('\u0000') && guard++ < 10) {
        s = s.replace(/\u0000(\d+)\u0000/g, (_, idx) => stash[Number(idx)]);
      }
      return s;
    }

    format(s) {
      return s
        .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
        .replace(/(^|[^*\w])\*(?![\s*])([^*]*?[^\s*])\*(?![*\w])/g, '$1<em>$2</em>')
        .replace(/(^|[^_\w])_(?![\s_])([^_]*?[^\s_])_(?![_\w])/g, '$1<em>$2</em>')
        .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
        .replace(/(?: {2,}|\\)\n/g, '<br>\n');
    }
  }

  function isAllowedClass(value) {
    return value.split(/\s+/).every(c => !c || c.startsWith('md-') || c === 'material-symbols-outlined');
  }

  function sanitizeNode(node) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const tag = child.tagName.toLowerCase();
      if (DROPPED_TAGS.has(tag)) {
        child.remove();
        continue;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        sanitizeNode(child);
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }

      const allowed = new Set([...ALLOWED_ATTRS['*'], ...(ALLOWED_ATTRS[tag] || [])]);
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value;
        if (name === 'id' && /^md-[\p{L}\p{N}_-]*$/u.test(value)) continue;
        if (name === 'class' && isAllowedClass(value)) continue;
        if (!allowed.has(name)) {
          child.removeAttribute(attr.name);
          continue;
        }
        if (name === 'href' || name === 'src') {
          const safe = safeUrl(value, { image: name === 'src' });
          if (safe) {
            child.setAttribute(name, safe);
          } else {
            child.removeAttribute(attr.name);
          }
        }
      }

      if (tag === 'a') {
        const href = child.getAttribute('href');
        if (href && !href.startsWith('#')) {
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noopener noreferrer');
        }
      } else if (tag === 'img') {
        if (!child.getAttribute('src')) {
          const placeholder = child.ownerDocument.createElement('span');
          placeholder.className = 'md-image-missing';
          placeholder.textContent = child.getAttribute('alt') || 'Image';
          child.replaceWith(placeholder);
          continue;
        }
        child.setAttribute('loading', 'lazy');
        child.setAttribute('decoding', 'async');
        child.setAttribute('referrerpolicy', 'no-referrer');
      }

      sanitizeNode(child);
    }
  }

  function sanitize(html) {
    // DOMParser documents are inert: scripts never execute and resources never load.
    const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');
    sanitizeNode(doc.body);
    return doc.body.innerHTML;
  }

  window.AltusMarkdown = {
    render(source) {
      return sanitize(new Renderer().render(source));
    }
  };
})();
