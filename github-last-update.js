/**************************************************************
 * github-last-update.js
 * Updates "Last update" label from latest GitHub commit
 **************************************************************/

async function updateLastUpdateFromGitHub() {
  const el = document.getElementById("last-update-display");
  if (!el) return;

  const fallbackFromLastModified = () => {
    try {
      const d = new Date(document.lastModified);
      if (!d || isNaN(d.getTime())) return null;
      return formatDDMMYYYYSlash(d);
    } catch {
      return null;
    }
  };

  const safeSet = (ddmmyyyy) => {
    if (ddmmyyyy) el.textContent = `Last update: ${ddmmyyyy}`;
    else el.textContent = "Last update: -";
  };

  const owner = (GITHUB_REPO?.owner || "").trim();
  const repo = (GITHUB_REPO?.repo || "").trim();
  const looksLikePlaceholder =
    !owner || !repo || owner === "username" || repo === "repository-name";

  if (looksLikePlaceholder) {
    safeSet(fallbackFromLastModified());
    return;
  }

  try {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=1`;

    const resp = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/vnd.github+json" }
    });

    if (!resp.ok) {
      safeSet(fallbackFromLastModified());
      return;
    }

    const data = await resp.json();
    const iso =
      data?.[0]?.commit?.committer?.date ||
      data?.[0]?.commit?.author?.date;

    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) {
      safeSet(fallbackFromLastModified());
      return;
    }

    safeSet(formatDDMMYYYYSlash(d));
  } catch {
    safeSet(fallbackFromLastModified());
  }
}