import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Exercise the target-owned checker as a CLI, with isolated flat-directory
// fixtures. Never mutate the approved config or site HTML.
const checker = new URL("../check-nav-sync.mjs", import.meta.url);
const config = {
  headerNav: [{ href: "/", label: "Home" }, { href: "/work", label: "Work" }],
  cta: { href: "/contact", label: "Start a Conversation" },
  footerNav: [{ href: "/", label: "Home" }, { href: "/privacy", label: "Privacy" },
    { href: "https://example.org/profile", label: "Profile", external: true }],
};
const internal = '<a href="contact" class="btn btn-primary nav-cta">Start a Conversation</a>';
const external = protocol => `<a href="${protocol}://example.org/contact" target="_blank" rel="noopener" class="btn btn-primary nav-cta">Start a Conversation</a>`;
const html = (cta = internal) => `<nav class="nav-links" id="navLinks">
      <a href="./" class="active">Home</a>
      <a href="work">Work</a>
      ${cta}
    </nav>
      <div>
        <h5>Navigate</h5>
        <a href="./" class="active">Home</a>
        <a href="privacy">Privacy</a>
        <a href="https://example.org/profile" target="_blank" rel="noopener">Profile</a>
      </div>`;

function run(t, markup = html(), cta = config.cta, mutateConfig = x => x) {
  const dir = mkdtempSync(join(tmpdir(), "target-nav-check-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  copyFileSync(checker, join(dir, "check-nav-sync.mjs"));
  writeFileSync(join(dir, "nav.config.json"), JSON.stringify(mutateConfig({ ...config, cta })));
  writeFileSync(join(dir, "index.html"), markup);
  const result = spawnSync(process.execPath, [join(dir, "check-nav-sync.mjs")], { encoding: "utf8" });
  assert.ifError(result.error);
  return { code: result.status, output: result.stdout + result.stderr };
}

test("approved internal Contact is normalized and remains same-tab", t => {
  const result = run(t);
  assert.equal(result.code, 0, result.output);
});

for (const protocol of ["https", "http", "HTTPS"]) {
  test(`${protocol} external CTA requires the approved new-tab attributes`, t => {
    const result = run(t, html(external(protocol)), { ...config.cta, href: `${protocol}://example.org/contact` });
    assert.equal(result.code, 0, result.output);
  });
}

for (const [name, markup, cta, diagnostic] of [
  ["internal new-tab attributes", html(internal.replace(' class=', ' target="_blank" rel="noopener" class=')), config.cta, "header nav"],
  ["unnormalized internal href", html(internal.replace('href="contact"', 'href="/contact"')), config.cta, "header nav"],
  ["wrong CTA href", html(internal.replace('href="contact"', 'href="wrong"')), config.cta, "header nav"],
  ["wrong CTA label", html(internal.replace("Start a Conversation", "Wrong label")), config.cta, "header nav"],
  ["external missing target", html(external("https").replace(' target="_blank"', "")), { ...config.cta, href: "https://example.org/contact" }, "header nav"],
  ["external wrong target", html(external("https").replace("_blank", "_self")), { ...config.cta, href: "https://example.org/contact" }, "header nav"],
  ["external missing rel", html(external("https").replace(' rel="noopener"', "")), { ...config.cta, href: "https://example.org/contact" }, "header nav"],
  ["external wrong rel", html(external("https").replace("noopener", "opener")), { ...config.cta, href: "https://example.org/contact" }, "header nav"],
  ["header href drift", html().replace('href="work"', 'href="wrong"'), config.cta, "header nav"],
  ["header label drift", html().replace(">Work<", ">Wrong<"), config.cta, "header nav"],
  ["header active drift", html().replace(' class="active"', ""), config.cta, "header nav"],
  ["footer href drift", html().replace('href="privacy"', 'href="wrong"'), config.cta, "footer nav"],
  ["footer label drift", html().replace(">Privacy<", ">Wrong<"), config.cta, "footer nav"],
  ["footer external attribute drift", html().replace(' rel="noopener"', ""), config.cta, "footer nav"],
  ["missing header", html().replace('id="navLinks"', 'id="wrong"'), config.cta, "could not find"],
  ["missing footer", html().replace("<h5>Navigate</h5>", "<h5>Wrong</h5>"), config.cta, "could not find"],
]) {
  test(`rejects ${name}`, t => {
    const result = run(t, markup, cta);
    assert.equal(result.code, 1, result.output);
    assert.ok(result.output.includes(diagnostic), result.output);
  });
}

test("new configured link without HTML synchronization still fails", t => {
  const result = run(t, html(), config.cta, c => ({
    ...c, headerNav: [...c.headerNav, { href: "/extra", label: "Extra" }],
  }));
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /header nav is out of sync/);
});
