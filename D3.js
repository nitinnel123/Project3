const width = 960, height = 550;
const svg = d3.select("svg");
const tooltip = d3.select(".tooltip");
const projection = d3.geoNaturalEarth1().scale(160).translate([width / 2, height / 2]);
const path = d3.geoPath(projection);
let year = 1960, metric = "gdp";

const nameMap = {
  "USA": "United States of America",
  "United States": "United States of America",
  "U.S.A.": "United States of America",
  "Bahamas, The": "Bahamas",
  "Brunei Darussalam": "Brunei",
  "Cabo Verde": "Cape Verde",
  "Congo, Dem. Rep.": "Democratic Republic of the Congo",
  "Congo, Rep.": "Republic of the Congo",
  "Cote d'Ivoire": "Ivory Coast",
  "Egypt, Arab Rep.": "Egypt",
  "Eswatini": "Swaziland",
  "Gambia, The": "Gambia",
  "Guinea-Bissau": "Guinea Bissau",
  "Iran, Islamic Rep.": "Iran",
  "Korea, Dem. People’s Rep.": "North Korea",
  "Korea, Dem. People's Rep.": "North Korea",
  "Dem. People’s Rep. Korea": "North Korea",
  "Democratic People's Republic of Korea": "North Korea",
  "Korea, Rep.": "South Korea",
  "Lao PDR": "Laos",
  "Macedonia": "North Macedonia",
  "Russian Federation": "Russia",
  "Syrian Arab Republic": "Syria",
  "Venezuela, RB": "Venezuela",
  "Viet Nam": "Vietnam",
  "Yemen, Rep.": "Yemen",
  "Bolivia (Plurinational State of)": "Bolivia",
  "Iran (Islamic Republic of)": "Iran",
  "Tanzania, United Republic of": "Tanzania",
  "United Republic of Tanzania": "Tanzania",
  "Republic of Serbia": "Serbia",
  "Western Sahara": "Morocco",
  "Micronesia, Fed. Sts.": "Micronesia",
  "St. Kitts and Nevis": "Saint Kitts and Nevis",
  "St. Lucia": "Saint Lucia",
  "St. Vincent and the Grenadines": "Saint Vincent and the Grenadines",
  "Antigua and Barbuda": "Antigua and Barbuda",
  "Czech Republic": "Czechia",
  "Timor-Leste": "East Timor",
  "São Tomé and Príncipe": "Sao Tome and Principe",
  "Slovak Republic": "Slovakia",
  "Hong Kong SAR, China": "Hong Kong",
  "Macao SAR, China": "Macao",
  "Palestine, State of": "Palestine",
  "Kyrgyz Republic": "Kyrgyzstan",
  "England": "United Kingdom",
  "Somalia": "Somaliland",
  "Somaliland": "Somaliland"
};

const normalize = n => (!n ? null : (nameMap[n] || n));

const getColorScale = m =>
  m === "gdp"
    ? d3.scaleSequential(d3.interpolateYlOrBr)
    : d3.scaleSequential(d3.interpolateRdYlGn);

Promise.all([
  d3.json("world.geojson"),
  d3.csv("economy-and-growth.csv"),
  d3.csv("social-development.csv")
]).then(([world, econ, social]) => {

  const safe = v => +v || null;
  const dataMap = {};

  econ.forEach(d => {
    const n = normalize(d["Country Name"]);
    if (!n) return;
    const key = `${n}-${d.Year}`;
    if (!dataMap[key]) dataMap[key] = { Country: n, Year: +d.Year };
    dataMap[key].gdp = safe(d["average_value_GDP per capita (current US$)"]);
  });

  social.forEach(d => {
    const n = normalize(d["Country Name"]);
    if (!n) return;
    const key = `${n}-${d.Year}`;
    if (!dataMap[key]) dataMap[key] = { Country: n, Year: +d.Year };
    const male = safe(d["average_value_Life expectancy at birth, male (years)"]);
    const female = safe(d["average_value_Life expectancy at birth, female (years)"]);
    if (male && female) dataMap[key].life = (male + female) / 2;
  });

  const data = Object.values(dataMap);

  function fillMissingData(data) {
    const byC = d3.group(data, d => d.Country);
    const filled = [];
    byC.forEach((records, country) => {
      records.sort((a, b) => a.Year - b.Year);
      const allYears = d3.range(1960, 2021);
      const keys = ["gdp", "life"];
      allYears.forEach(y => {
        let e = records.find(d => d.Year === y);
        if (!e) e = { Country: country, Year: y };
        keys.forEach(k => {
          if (e[k] == null) {
            const before = records.filter(d => d.Year < y && d[k] != null).slice(-1)[0];
            const after = records.find(d => d.Year > y && d[k] != null);
            if (before && after) {
              const r = (y - before.Year) / (after.Year - before.Year);
              e[k] = before[k] + r * (after[k] - before[k]);
            } else if (before) e[k] = before[k];
            else if (after) e[k] = after[k];
            else e[k] = null;
          }
        });
        filled.push(e);
      });
    });
    return filled;
  }

  const filledData = fillMissingData(data);

  let color = getColorScale(metric);
  const countries = svg.append("g").selectAll("path")
    .data(world.features)
    .join("path")
    .attr("d", path)
    .attr("fill", "#e0e0e0")
    .attr("stroke", "#999");

  const legendWidth = 250, legendHeight = 12;
  const legendSvg = svg.append("g").attr("transform", `translate(${width - legendWidth - 80},${height - 100})`);
  const defs = svg.append("defs");
  const linearGradient = defs.append("linearGradient").attr("id", "legend-gradient");
  legendSvg.append("rect").attr("width", legendWidth).attr("height", legendHeight)
    .style("fill", "url(#legend-gradient)").attr("stroke", "#999");
  const legendScale = d3.scaleLinear().range([0, legendWidth]);
  const legendAxis = legendSvg.append("g").attr("transform", `translate(0,${legendHeight})`);

  function updateLegend(min, max, label) {
    legendScale.domain([min, max]);
    legendAxis.call(d3.axisBottom(legendScale).tickValues([min, (min + max) / 2, max]).tickFormat(d3.format(".2s")));
    svg.selectAll(".legend-label").remove();
    svg.append("text")
      .attr("class", "legend-label")
      .attr("x", width - legendWidth - 80)
      .attr("y", height - 110)
      .text(label)
      .style("font-size", "13px")
      .style("font-weight", "600");
  }

  function update() {
    const yearData = filledData.filter(d => d.Year === year);
    const byC = {}; yearData.forEach(d => { byC[normalize(d.Country)] = d[metric]; });
    const values = Object.values(byC).filter(v => v != null);
    color = getColorScale(metric).domain([d3.min(values), d3.max(values)]);
    countries.transition().duration(400)
      .attr("fill", d => {
        const name = normalize(d.properties.name);
        const val = byC[name];
        return val ? color(val) : "#ccc";
      });
    const stops = metric === "gdp"
      ? [{ offset: "0%", color: d3.interpolateYlOrBr(0) }, { offset: "100%", color: d3.interpolateYlOrBr(1) }]
      : [{ offset: "0%", color: d3.interpolateRdYlGn(0) }, { offset: "100%", color: d3.interpolateRdYlGn(1) }];
    linearGradient.selectAll("stop").data(stops).join("stop")
      .attr("offset", d => d.offset).attr("stop-color", d => d.color);
    const label = metric === "gdp" ? "GDP per Capita (US$)" : "Life Expectancy (Years)";
    updateLegend(d3.min(values), d3.max(values), label);
  }

  countries.on("mousemove", (event, d) => {
    const n = normalize(d.properties.name);
    const v = filledData.find(x => normalize(x.Country) === n && x.Year === year);
    tooltip.style("left", (event.pageX + 12) + "px").style("top", (event.pageY - 28) + "px")
      .style("opacity", 1)
      .html(`<strong>${n}</strong><br>
        GDP: ${v?.gdp ? "$" + Math.round(v.gdp).toLocaleString() : "N/A"}<br>
        Life Expectancy: ${v?.life ? v.life.toFixed(1) + " years" : "N/A"}`);
  }).on("mouseout", () => tooltip.style("opacity", 0));

  d3.select("#metric").on("change", e => { metric = e.target.value; update(); });
  d3.select("#year").on("input", e => { year = +e.target.value; d3.select("#year-label").text(year); update(); });

  const popup = d3.select("#popup"), popupTitle = d3.select("#popup-title"), popupChart = d3.select("#popup-chart");
  d3.select("#close-btn").on("click", () => popup.classed("hidden", true));

  countries.on("click", (event, d) => {
    const cName = normalize(d.properties.name);
    const cData = filledData.filter(x => normalize(x.Country) === cName);
    if (!cData.length) { alert(`No data for ${cName}`); return; }
    popup.classed("hidden", false);
    popupTitle.text(`${cName} — GDP vs Life Expectancy`);
    const years = [...new Set(cData.map(d => d.Year))].sort((a, b) => a - b);
    const gdp = years.map(y => ({ year: y, value: cData.find(d => d.Year === y)?.gdp ?? null })).filter(d => d.value !== null);
    const life = years.map(y => ({ year: y, value: cData.find(d => d.Year === y)?.life ?? null })).filter(d => d.value !== null);
    popupChart.selectAll("*").remove();
    const margin = { top: 40, right: 60, bottom: 40, left: 70 }, w = 600 - margin.left - margin.right, h = 350 - margin.top - margin.bottom;
    const svgLine = popupChart.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const x = d3.scaleLinear().domain(d3.extent(years)).range([0, w]);
    const yL = d3.scaleLinear().domain([0, d3.max(gdp, d => d.value) * 1.1]).range([h, 0]);
    const yR = d3.scaleLinear().domain([d3.min(life, d => d.value) - 5, d3.max(life, d => d.value) + 5]).range([h, 0]);
    svgLine.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickFormat(d3.format("d")));
    svgLine.append("g").call(d3.axisLeft(yL).ticks(6));
    svgLine.append("g").attr("transform", `translate(${w},0)`).call(d3.axisRight(yR).ticks(6));
    const gdpLine = d3.line().x(d => x(d.year)).y(d => yL(d.value));
    const lifeLine = d3.line().x(d => x(d.year)).y(d => yR(d.value));
    svgLine.append("path").datum(gdp).attr("fill", "none").attr("stroke", "#2563eb").attr("stroke-width", 2).attr("d", gdpLine);
    svgLine.append("path").datum(life).attr("fill", "none").attr("stroke", "#dc2626").attr("stroke-width", 2).attr("d", lifeLine);
    const legend = svgLine.selectAll(".legend")
      .data([{ label: "GDP per Capita ($)", color: "#2563eb" }, { label: "Life Expectancy (years)", color: "#dc2626" }])
      .enter().append("g").attr("transform", (d, i) => `translate(0,${-25 - i * 15})`);
    legend.append("rect").attr("x", 0).attr("width", 12).attr("height", 12).attr("fill", d => d.color);
    legend.append("text").attr("x", 18).attr("y", 10).text(d => d.label).style("font-size", "12px");
  });

  update();
});
