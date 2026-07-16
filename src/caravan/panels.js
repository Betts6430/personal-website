import { PROJECTS } from './projects.js';
import { PROJECT_CROSS } from './world.js';

// Builds the six project panels into #sections from the project data, keyed
// to the flag-cross timeline: project i's card is up from when its banner
// crosses the trigger (PROJECT_CROSS[i]) until the next banner crosses. The
// cards are large panels filling the open sky on the left (styled in
// styles.css) so they never cover the city on the right. Each carries the
// full write-up (a media slot for photos/clips added later, the blurb, the
// feature list, the stack, and links).

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildProjectPanels() {
  const host = document.getElementById('sections');

  PROJECTS.forEach((proj, i) => {
    const start = PROJECT_CROSS[i];
    const end = PROJECT_CROSS[i + 1] ?? 1.01;

    const tag = proj.tag ? ` <span class="tag">${esc(proj.tag)}</span>` : '';
    const bullets = proj.bullets && proj.bullets.length
      ? `<ul>${proj.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
      : '';
    const links = proj.links
      .map(
        (l) =>
          `<a href="${l.href}" target="_blank" rel="noopener">${esc(l.label)} &#8599;</a>`,
      )
      .join('');
    const linksNav = links ? `<nav class="projlinks">${links}</nav>` : '';

    const sec = document.createElement('section');
    sec.className = 'panel project';
    sec.dataset.start = String(start);
    sec.dataset.end = String(end);
    sec.innerHTML = `
      <figure><div class="media-slot">Photos &amp; demo coming</div></figure>
      <p class="kicker"><span class="flagchip" style="background:${proj.flag}"></span>Project ${String(
        i + 1,
      ).padStart(2, '0')}</p>
      <h2>${esc(proj.title)}${tag}</h2>
      <p class="blurb">${esc(proj.blurb)}</p>
      ${bullets}
      <p class="stack">${esc(proj.stack)}</p>
      ${linksNav}
    `;
    host.appendChild(sec);
  });
}
