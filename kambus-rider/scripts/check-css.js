#!/usr/bin/env node

/**
 * Validates that CSS in web assets (.html <style> blocks and .css files) has balanced braces,
 * no unclosed comments, no negative depths (extra '}'), and ignores strings, comments, and url(...) contents.
 */

const fs = require('fs');
const path = require('path');

function getOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getLineAndText(content, offset) {
  let lineNum = 1;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (content[i] === '\n') {
      lineNum++;
      lineStart = i + 1;
    }
  }
  let lineEnd = content.indexOf('\n', lineStart);
  if (lineEnd === -1) lineEnd = content.length;
  let text = content.substring(lineStart, lineEnd);
  if (text.endsWith('\r')) text = text.slice(0, -1);
  return { lineNum, text };
}

function parseCss(css, baseOffset, fullContent) {
  let depth = 0;
  let inComment = false;
  let commentStartOffset = -1;
  let inString = null;
  let inUrl = false;
  let isEscaped = false;
  const braceStack = [];
  const errors = [];

  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    const next = i + 1 < css.length ? css[i + 1] : '';
    const fileOffset = baseOffset + i;

    if (inComment) {
      if (c === '*' && next === '/') {
        inComment = false;
        i++; // skip '/'
      }
      continue;
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (c === '\\') {
        isEscaped = true;
      } else if (c === inString) {
        inString = null;
      }
      continue;
    }

    if (inUrl) {
      if (isEscaped) {
        isEscaped = false;
      } else if (c === '\\') {
        isEscaped = true;
      } else if (c === '"' || c === "'") {
        inString = c;
      } else if (c === ')') {
        inUrl = false;
      }
      continue;
    }

    // Check for comment start
    if (c === '/' && next === '*') {
      inComment = true;
      commentStartOffset = fileOffset;
      i++; // skip '*'
      continue;
    }

    // Check for string start
    if (c === '"' || c === "'") {
      inString = c;
      continue;
    }

    // Check for url(...) start
    if ((c === 'u' || c === 'U') && (i === 0 || /[^a-zA-Z0-9_-]/.test(css[i - 1]))) {
      const rest = css.slice(i);
      const urlMatch = rest.match(/^url\s*\(/i);
      if (urlMatch) {
        inUrl = true;
        i += urlMatch[0].length - 1;
        continue;
      }
    }

    // Braces
    if (c === '{') {
      depth++;
      braceStack.push({ offset: fileOffset });
    } else if (c === '}') {
      if (depth <= 0) {
        const info = getLineAndText(fullContent, fileOffset);
        errors.push({
          type: 'extra_brace',
          lineNum: info.lineNum,
          lineText: info.text,
          message: `extra "}" appeared at line ${info.lineNum}`
        });
        depth = 0;
      } else {
        depth--;
        braceStack.pop();
      }
    }
  }

  if (inComment) {
    const info = getLineAndText(fullContent, commentStartOffset);
    errors.push({
      type: 'unclosed_comment',
      lineNum: info.lineNum,
      lineText: info.text,
      message: `unclosed comment "/*" opened at line ${info.lineNum}`
    });
  }

  if (depth > 0) {
    for (const item of braceStack) {
      const info = getLineAndText(fullContent, item.offset);
      errors.push({
        type: 'unclosed_brace',
        lineNum: info.lineNum,
        lineText: info.text,
        message: `unclosed "{" opened at line ${info.lineNum}`
      });
    }
  }

  return { depth, errors };
}

function findAssetFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'vendor' && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        results.push(...findAssetFiles(fullPath));
      }
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.html') || entry.name.endsWith('.css')) {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const assetsDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(rootDir, 'app/src/main/assets');

  if (!fs.existsSync(assetsDir)) {
    console.error(`Assets directory not found: ${assetsDir}`);
    process.exit(1);
  }

  const files = findAssetFiles(assetsDir);
  let totalErrors = 0;
  const successLines = [];

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf8');

    if (filePath.endsWith('.css')) {
      const res = parseCss(content, 0, content);
      if (res.errors.length > 0) {
        totalErrors += res.errors.length;
        for (const err of res.errors) {
          console.error(`ERROR: ${fileName}: ${err.message}:`);
          console.error(`  ${err.lineText}`);
        }
      } else {
        successLines.push(`${relPath}: depth ${res.depth}`);
      }
    } else if (filePath.endsWith('.html')) {
      const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
      let match;
      let blockCount = 0;
      let fileDepth = 0;
      let fileHadErrors = false;

      while ((match = styleRegex.exec(content)) !== null) {
        blockCount++;
        const tagEnd = match[0].indexOf('>') + 1;
        const css = match[1];
        const baseOffset = match.index + tagEnd;
        const res = parseCss(css, baseOffset, content);
        fileDepth += res.depth;

        if (res.errors.length > 0) {
          fileHadErrors = true;
          totalErrors += res.errors.length;
          for (const err of res.errors) {
            console.error(`ERROR: ${fileName} (${getOrdinal(blockCount)} <style> block): ${err.message}:`);
            console.error(`  ${err.lineText}`);
          }
        }
      }

      if (!fileHadErrors) {
        successLines.push(`${relPath}: depth ${fileDepth}`);
      }
    }
  }

  if (totalErrors > 0) {
    console.error(`\nCSS check failed with ${totalErrors} error(s).`);
    process.exit(1);
  }

  for (const line of successLines) {
    console.log(line);
  }
  console.log('All CSS balanced');
  process.exit(0);
}

main();
