// Sheet switching, cross-drawing highlight and theme for the architecture review page.
const pages = [...document.querySelectorAll<HTMLElement>('.sheet-page')];
function show(index: number): void {
  pages.forEach(page => { page.hidden = page.dataset.sheet !== String(index); });
  document.querySelectorAll('.tabs [data-goto]').forEach(tab => tab.setAttribute('aria-pressed', String((tab as HTMLElement).dataset.goto === String(index))));
}
document.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach(button => {
  button.onclick = () => {
    show(Number(button.dataset.goto));
    if (button.closest('.recommend')) document.querySelector('.tabs, .sheet-page:not([hidden])')?.scrollIntoView({ block: 'start' });
  };
});
// A node keeps its id in both drawings; pointing at one lights up its counterpart.
pages.forEach(page => {
  page.querySelectorAll<SVGGElement>('.node[data-node]').forEach(node => {
    const link = (on: boolean): void => page.querySelectorAll<SVGGElement>(`.node[data-node="${node.dataset.node}"]`).forEach(item => item.classList.toggle('linked', on));
    node.addEventListener('pointerenter', () => link(true));
    node.addEventListener('pointerleave', () => link(false));
  });
});
document.querySelectorAll<HTMLButtonElement>('.theme-toggle').forEach(button => {
  button.onclick = () => {
    const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('birdview-theme', theme); } catch {}
  };
});
