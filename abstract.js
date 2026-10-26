/**************************************************************
 * abstract.js
 * Monthly abstract (FY Apr->Mar)
 **************************************************************/

function generateAbstract() {
  const fy = document.getElementById("fy-select").value;

  document.getElementById("abstract-title").innerText =
    `Pepara Wildlife Sanctuary (Vazhvanthol Waterfalls Visit) ${fy}`;

  const startYear = parseInt((fy || "").split("-")[0], 10);
  if (!startYear || isNaN(startYear)) {
    document.getElementById("abstract-tbody").innerHTML = "";
    document.getElementById("abstract-tfoot").innerHTML = "";
    return;
  }

  const fyStart = new Date(startYear, 3, 1);
  const fyEnd = new Date(startYear + 1, 3, 1);

  const months = [
    { name: "Apr", year: startYear.toString().slice(-2) },
    { name: "May", year: startYear.toString().slice(-2) },
    { name: "Jun", year: startYear.toString().slice(-2) },
    { name: "Jul", year: startYear.toString().slice(-2) },
    { name: "Aug", year: startYear.toString().slice(-2) },
    { name: "Sep", year: startYear.toString().slice(-2) },
    { name: "Oct", year: startYear.toString().slice(-2) },
    { name: "Nov", year: startYear.toString().slice(-2) },
    { name: "Dec", year: startYear.toString().slice(-2) },
    { name: "Jan", year: (startYear + 1).toString().slice(-2) },
    { name: "Feb", year: (startYear + 1).toString().slice(-2) },
    { name: "Mar", year: (startYear + 1).toString().slice(-2) }
  ];

  const buckets = months.map(() => ({
    rev: 0,
    sf: 0,
    iA: 0, iC: 0,
    fA: 0, fC: 0
  }));

  const list = Array.from(historyCache.values());
  for (const r of list) {
    const dateObj = parseLocalYMD(r.dateStr);
    if (!dateObj) continue;
    if (dateObj < fyStart || dateObj >= fyEnd) continue;

    const m = dateObj.getMonth();
    const idx = (m >= 3) ? (m - 3) : (m + 9);

    const b = buckets[idx];
    if (!b) continue;

    b.rev += Number(r.income || 0);
    b.sf += Number(r.rr || 0);

    const pkg5Count = Number(r.pkg5Count || 0);
    const pkg10Count = Number(r.pkg10Count || 0);
    const extraPersons = Number(r.extraPersons || 0);
    const children = Number(r.children || 0);
    const adults = (pkg5Count * 5) + (pkg10Count * 10) + extraPersons;

    if (r.nationality === "indian") {
      b.iA += adults;
      b.iC += children;
    } else if (r.nationality === "foreigner") {
      b.fA += adults;
      b.fC += children;
    }
  }

  let tbodyHtml = "";
  let totRev = 0, totSf = 0, totIa = 0, totIc = 0, totFa = 0, totFc = 0, totAll = 0;

  months.forEach((m, i) => {
    const monthLabel = `${m.name}-${m.year}`;
    const data = buckets[i];

    const totalVisitors = (data.iA + data.iC + data.fA + data.fC);

    totRev += data.rev; totSf += data.sf;
    totIa += data.iA; totIc += data.iC;
    totFa += data.fA; totFc += data.fC;
    totAll += totalVisitors;

    tbodyHtml += `
      <tr>
        <td>${monthLabel}</td>
        <td>${data.rev ? data.rev.toFixed(2) : ""}</td>
        <td>${data.sf ? data.sf.toFixed(2) : ""}</td>
        <td>${data.iA || ""}</td>
        <td>${data.iC || ""}</td>
        <td>${data.fA || ""}</td>
        <td>${data.fC || ""}</td>
        <td style="font-weight:bold;">${totalVisitors || "0"}</td>
      </tr>
    `;
  });

  document.getElementById("abstract-tbody").innerHTML = tbodyHtml;

  document.getElementById("abstract-tfoot").innerHTML = `
    <tr>
      <th>Total</th>
      <th>${totRev ? totRev.toFixed(2) : ""}</th>
      <th>${totSf ? totSf.toFixed(2) : ""}</th>
      <th>${totIa || ""}</th>
      <th>${totIc || ""}</th>
      <th>${totFa || ""}</th>
      <th>${totFc || ""}</th>
      <th>${totAll || "0"}</th>
    </tr>
  `;
}