#!/usr/bin/env node
/**
 * check-nav-sync.mjs
 *
 * Validates that every HTML file's <nav> block and footer "Navigate" section
 * match nav.config.json exactly.
 *
 * Exits with code 1 (and prints details) if anything is out of sync.
 *
 * Usage:  pnpm nav:check
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const config = JSON.parse(readFileSync(resolve(__dirname, "nav.config.json"), "utf8"));

// ── helpers ──────────────────────────────────────────────────────────────────

function toStaticHref(spaHref) {
  if (spaHref === "/") return "./";
  return spaHref.replace(/^\//, "");
}

function activeHrefForFile(filename) {
  const slug = basename(filename, ".html");
  return slug === "index" ? "./" : slug;
}

function buildNav(activeHref) {
  const indent = "      ";
  const lines = [];
  for (const item of config.headerNav) {
    const href = toStaticHref(item.href);
    const isActive = href === activeHref;
    const cls = isActive ? ' class="active"' : "";
    lines.push(indent + '<a href="' + href + '"' + cls + ">" + item.label + "</a>");
  }
  lines.push(
    indent +
      '<a href="' +
      config.cta.href +
      '" target="_blank" rel="noopener" class="btn btn-primary nav-cta">' +
      config.cta.label +
      "</a>"
  );
  return lines.join("\n");
}

function buildFooterNav(activeHref) {
  const indent = "        ";
  const lines = [];
  for (const item of config.footerNav) {
    const href = item.external ? item.href : toStaticHref(item.href);
    const isActive = !item.external && href === activeHref;
    const cls = isActive ? ' class="active"' : "";
    if (item.external) {
      lines.push(indent + '<a href="' + href + '" target="_blank" rel="noopener"' + cls + ">" + item.label + "</a>");
    } else {
      lines.push(indent + '<a href="' + href + '"' + cls + ">" + item.label + "</a>");
    }
  }
  return lines.join("\n");
}

const NAV_RE = /<nav class="nav-links" id="navLinks">\n([\s\S]*?)\n\s*<\/nav>/;
const FOOTER_NAV_RE = /<h5>Navigate<\/h5>\n([\s\S]*?)\n      <\/div>/;

// ── Check every HTML file ─────────────────────────────────────────────────────

const htmlFiles = readdirSync(__dirname).filter((f) => f.endsWith(".html"));

let errors = 0;

for (const file of htmlFiles) {
  const content = readFileSync(resolve(__dirname, file), "utf8");
  let fileOk = true;

  // ── Header nav ──
  const navMatch = content.match(NAV_RE);
  if (!navMatch) {
    console.error("✗ " + file + ': could not find <nav class="nav-links" id="navLinks"> block');
    errors++;
    fileOk = false;
  } else {
    const actual = navMatch[1].trimEnd();
    const expected = buildNav(activeHrefForFile(file)).trimEnd();
    if (actual !== expected) {
      console.error("✗ " + file + ": header nav is out of sync with nav.config.json");
      console.error("  Expected:");
      expected.split("\n").forEach((l) => console.error("    " + l));
      console.error("  Found:");
      actual.split("\n").forEach((l) => console.error("    " + l));
      errors++;
      fileOk = false;
    }
  }

  // ── Footer nav ──
  const footerMatch = content.match(FOOTER_NAV_RE);
  if (!footerMatch) {
    console.error("✗ " + file + ": could not find footer <h5>Navigate</h5> block");
    errors++;
    fileOk = false;
  } else {
    const actual = footerMatch[1].trimEnd();
    const expected = buildFooterNav(activeHrefForFile(file)).trimEnd();
    if (actual !== expected) {
      console.error("✗ " + file + ": footer nav is out of sync with nav.config.json");
      console.error("  Expected:");
      expected.split("\n").forEach((l) => console.error("    " + l));
      console.error("  Found:");
      actual.split("\n").forEach((l) => console.error("    " + l));
      errors++;
      fileOk = false;
    }
  }

  if (fileOk) {
    console.log("✓ " + file);
  }
}

// ── summary ──────────────────────────────────────────────────────────────────

if (errors > 0) {
  console.error("\n" + errors + " check(s) failed.");
  console.error("  Run the sync script in the source monorepo to fix: pnpm nav:sync");
  process.exit(1);
} else {
  console.log("\nAll nav sources match nav.config.json ✓");
  console.log("  • " + htmlFiles.length + " static HTML files checked (header + footer nav)");
}
