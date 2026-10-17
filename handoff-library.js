(function () {
  var root = document.getElementById("library-app");
  if (!root) return;

  var collection = root.getAttribute("data-collection");
  var research = collection === "publications";
  var pageSize = 12;
  var entries = [];
  var query = "";
  var category = new URLSearchParams(window.location.search).get("category") || "All";
  var facet = new URLSearchParams(window.location.search).get("group") || "";
  var limit = pageSize;
  var errorMessage = "";

  function safeUrl(value) {
    if (!value) return "";
    try {
      var url = new URL(value, window.location.origin);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function normalized(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function hostname(value) {
    try {
      return new URL(value).hostname.replace(/^www\./, "");
    } catch (_) {
      return "Open link";
    }
  }

  function updateCategory(value) {
    category = value;
    limit = pageSize;
    var url = new URL(window.location.href);
    if (value === "All") url.searchParams.delete("category");
    else url.searchParams.set("category", value);
    window.history.pushState(null, "", url);
    render();
  }

  function filteredEntries() {
    return entries
      .filter(function (entry) { return category === "All" || entry.category === category; })
      .filter(function (entry) { return !facet || classify(entry) === facet; })
      .filter(function (entry) {
        return normalized([
          entry.title, entry.publisher, entry.description, entry.year, entry.category,
          entry.attribution, entry.linkStatus, entry.notes
        ].join(" ")).includes(normalized(query.trim()));
      });
  }

  // Independent presentation facets, never replacements for category or attribution.
  function classify(entry) {
    var info = [entry.publisher, entry.description || "", entry.notes || ""].join(" ");
    if (research) {
      if (/technical (?:report|publication)|programme report|program report/i.test(info)) return "Technical Publications";
      if (!/not peer.reviewed|non.peer.reviewed/i.test(info) && /peer.reviewed|Marine Policy|Ocean [&and]+ Coastal Management|Biodiversity and Conservation|Conservation and Society|Conservation Science and Practice/i.test(info)) return "Peer-Reviewed Research";
      if (/\bADB\b|Asian Development Bank|institutional publication/i.test(info)) return "Institutional Publications";
      if (/The Regenerate Leap/i.test(entry.title) || /\bbook\b|\bchapter\b/i.test(info)) return "Books and Book Chapters";
      return "";
    }
    if (/\bAI\b|artificial intelligence/i.test(entry.title)) return "Artificial Intelligence and Organisational Design";
    if (/ocean|fisher|marine|seafood|coastal|coral/i.test(entry.title)) return "Ocean Governance and Development";
    if (/board|operating model|oversight|governance|institution|efficiency.*fragility/i.test(entry.title)) return "Institutions, Boards and Operating Models";
    if (/leadership|leader|grief|trauma|irreversible|regenerate|resilience/i.test(entry.title)) return "Leadership and Irreversible Change";
    return "";
  }

  function entryMarkup(entry) {
    var direct = safeUrl(entry.url);
    var source = safeUrl(entry.sourceUrl);
    var href = direct || source;
    var alternatives = String(entry.alternatives || "").split(/\r?\n/).map(safeUrl).filter(Boolean);
    var links = [];
    if (direct) links.push('<a href="' + escapeHtml(direct) + '" target="_blank" rel="noopener noreferrer">Open publication</a>');
    if (source && source !== direct) links.push('<a href="' + escapeHtml(source) + '" target="_blank" rel="noopener noreferrer">Source record</a>');
    alternatives.forEach(function (alternative, index) {
      links.push('<a href="' + escapeHtml(alternative) + '" target="_blank" rel="noopener noreferrer">Alternative ' + (index + 1) + '</a>');
    });
    var title = escapeHtml(entry.title);
    return '<article class="library-entry">' +
      '<div class="entry-meta">' + escapeHtml(entry.publisher) + ' · ' + escapeHtml(classify(entry) || (research ? "Publication type not specified" : "Topic not classified")) +
      (entry.year ? ' · ' + escapeHtml(entry.year) : "") +
      (!research ? ' · ' + escapeHtml(entry.category) : "") + '</div>' +
      '<h2>' + (href ? '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + title + '</a>' : title) + '</h2>' +
      (entry.description && !research ? '<p>' + escapeHtml(entry.description) + '</p>' : "") +
      (entry.attribution ? '<p class="attribution">' + escapeHtml(entry.attribution) + '</p>' : "") +
      (entry.linkStatus ? '<p>' + escapeHtml(entry.linkStatus) + '</p>' : "") +
      (links.length ? '<div class="entry-links">' + links.join("") + '</div>' : "") +
      (alternatives.length
        ? '<details class="entry-alternatives"><summary>Alternative formats and platforms (' + alternatives.length + ')</summary><ul>' +
          alternatives.map(function (alternative) {
            return '<li><a href="' + escapeHtml(alternative) + '" target="_blank" rel="noopener noreferrer">' +
              escapeHtml(hostname(alternative)) + '</a></li>';
          }).join("") + '</ul></details>'
        : "") +
      '</article>';
  }

  function render() {
    var categories = [];
    entries.forEach(function (entry) {
      if (categories.indexOf(entry.category) === -1) categories.push(entry.category);
    });
    var filtered = filteredEntries();
    var visible = filtered.slice(0, limit);
    var countText = filtered.length + (filtered.length === 1 ? " entry" : " entries") + " matching" +
      (query.trim() ? ' “' + query.trim() + '”' : "");
    var filterMarkup = !research
      ? '<div class="category-filters" role="group" aria-label="Filter by category">' +
        ["All"].concat(categories).map(function (item) {
          return '<button type="button" data-category="' + escapeHtml(item) + '" aria-pressed="' +
            (category === item ? "true" : "false") + '">' + escapeHtml(item) + '</button>';
        }).join("") + '</div>'
      : "";
    var facets = Array.from(new Set(entries.map(classify).filter(Boolean))).sort();
    var facetMarkup = facets.length ? '<div class="library-search"><label for="library-group">' +
      (research ? 'Publication type' : 'Topic') + '</label><select id="library-group"><option value="">All (including unclassified)</option>' +
      facets.concat(facet && !facets.includes(facet) ? [facet] : []).map(function(value) {
        return '<option' + (facet === value ? ' selected' : '') + '>' + escapeHtml(value) + '</option>';
      }).join('') + '</select></div>' : '';
    root.innerHTML =
      '<div class="library-controls">' +
        '<div class="library-search"><label for="library-search">' +
          (research ? "Search by title, type or year" : "Search by title, publisher or year") +
          '</label><input id="library-search" type="search" value="' + escapeHtml(query) +
          '" placeholder="' + (research ? "Search publications" : "Search writing and media") + '"></div>' +
        filterMarkup + facetMarkup +
      '</div>' +
      '<div class="library-status"><p role="status" aria-live="polite">' + escapeHtml(countText) + '</p>' +
        ((query || category !== "All" || facet) ? '<button class="library-action" type="button" data-clear>Clear filters</button>' : "") +
      '</div>' +
      (errorMessage
        ? '<div class="library-empty" role="alert"><h2>Library unavailable</h2><p>' + escapeHtml(errorMessage) +
          '</p><button type="button" class="library-action" data-retry>Try again</button></div>'
        : filtered.length === 0
          ? '<div class="library-empty"><h2>' + (entries.length ? "No matching entries" : "No published entries yet") +
            '</h2><p>' + (entries.length ? "Try another title, publisher or year, or clear your filters." : "The library will appear here when entries are ready.") + '</p></div>'
          : '<div class="library-results' + (research ? ' research-results' : '') + '">' +
            visible.map(entryMarkup).join("") + '</div>' +
            (filtered.length > visible.length ? '<button class="library-action library-more" type="button" data-more>Show more</button>' : ""));

    var input = root.querySelector("#library-search");
    input.addEventListener("input", function (event) {
      query = event.target.value;
      limit = pageSize;
      var cursor = event.target.selectionStart;
      render();
      var nextInput = root.querySelector("#library-search");
      nextInput.focus();
      nextInput.setSelectionRange(cursor, cursor);
    });
    root.querySelectorAll("[data-category]").forEach(function (button) {
      button.addEventListener("click", function () { updateCategory(button.getAttribute("data-category")); });
    });
    var group = root.querySelector("#library-group");
    if (group) group.addEventListener("change", function(event) {
      facet = event.target.value;
      limit = pageSize;
      var url = new URL(window.location.href);
      if (facet) url.searchParams.set("group", facet); else url.searchParams.delete("group");
      window.history.pushState(null, "", url);
      render();
      root.querySelector("#library-group").focus();
    });
    var clear = root.querySelector("[data-clear]");
    if (clear) clear.addEventListener("click", function () {
      query = "";
      category = "All";
      facet = "";
      limit = pageSize;
      var url = new URL(window.location.href);
      url.searchParams.delete("category");
      url.searchParams.delete("group");
      window.history.pushState(null, "", url);
      render();
    });
    var more = root.querySelector("[data-more]");
    if (more) more.addEventListener("click", function () {
      limit += pageSize;
      render();
    });
    var retry = root.querySelector("[data-retry]");
    if (retry) retry.addEventListener("click", load);
  }

  window.addEventListener("popstate", function () {
    category = new URLSearchParams(window.location.search).get("category") || "All";
    facet = new URLSearchParams(window.location.search).get("group") || "";
    limit = pageSize;
    render();
  });

  var libraryEndpoint = new URL("api/library", new URL(".", document.currentScript.src));

  function load() {
    errorMessage = "";
    root.innerHTML = '<p role="status" aria-live="polite">Loading the published library…</p>';
    fetch(libraryEndpoint.href + "?collection=" + encodeURIComponent(collection), {
      headers: { Accept: "application/json" }
    }).then(function (response) {
      if (!response.ok) throw new Error("The library could not be loaded (HTTP " + response.status + ").");
      return response.json();
    }).then(function (data) {
      if (!Array.isArray(data)) throw new Error("The library response was not valid.");
      // The API has already selected approved, published research records.
      // Keep unknown types visible and retain record-level attribution.
      entries = data;
      var categories = entries.map(function (entry) { return entry.category; });
      if (category !== "All" && categories.indexOf(category) === -1) category = "All";
      render();
    }).catch(function (error) {
      errorMessage = error instanceof Error ? error.message : "Please try again later.";
      render();
    });
  }

  load();
})();
