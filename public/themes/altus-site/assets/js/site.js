(() => {
    const button = document.querySelector('.theme-toggle');
    const root = document.documentElement;
    const update = () => {
        const dark = root.dataset.theme === 'dark';
        button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
        button.title = button.getAttribute('aria-label');
        button.querySelector('span').textContent = dark ? 'light_mode' : 'dark_mode';
    };
    button.hidden = false;
    button.addEventListener('click', () => {
        root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('altus_theme', root.dataset.theme); } catch (error) {}
        update();
    });
    update();
})();
