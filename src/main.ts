import { initStorage } from './storage';
import { loadAll, archiveStaleBookmarks } from './store';
import { initUI, renderAll } from './ui';

async function main(): Promise<void> {
  const loadingEl = document.getElementById('loading')!;
  const messageEl = document.getElementById('loading-message')!;
  const subEl     = document.getElementById('loading-sub')!;
  const spinnerEl = document.getElementById('loading-spinner')!;
  const openBtn   = document.getElementById('btn-open-folder') as HTMLButtonElement;

  initUI();

  async function launch(forceNew: boolean): Promise<void> {
    openBtn.disabled = true;
    spinnerEl.style.display = 'block';
    messageEl.textContent = 'Opening folder…';
    subEl.textContent = '';
    try {
      await initStorage(forceNew);
      messageEl.textContent = 'Loading bookmarks…';
      await loadAll();
      await archiveStaleBookmarks();
      loadingEl.classList.add('hidden');
      renderAll();
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError' || e.message.includes('aborted') || e.message.includes('user')) {
        messageEl.textContent = 'VM Bookmarks Manager';
        subEl.textContent = 'Select the folder where your bookmarks will be stored.';
      } else {
        messageEl.textContent = `Error: ${e.message}`;
        subEl.textContent = 'Try again or refresh the page.';
      }
      spinnerEl.style.display = 'none';
      openBtn.disabled = false;
    }
  }

  openBtn.addEventListener('click', () => launch(false));
  document.getElementById('btn-change-folder')!.addEventListener('click', () => launch(true));
}

main();
