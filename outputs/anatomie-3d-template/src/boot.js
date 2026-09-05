(() => {
  const panel = document.querySelector('#controlsPanel');
  const desktop = matchMedia('(min-width:901px), (max-height:560px) and (orientation:landscape)');
  panel.open = desktop.matches;
  desktop.addEventListener('change', event => { panel.open = event.matches; });
  document.querySelector('#startupRetry').addEventListener('click', () => location.reload());
  import('./app.js?v=20260905-2').catch(error => {
    console.error('Démarrage de l’atlas impossible', error);
    const message = document.querySelector('#loadingState');
    message.hidden = false;
    message.classList.add('is-error');
    document.querySelector('#loadingMessage').textContent = 'L’atlas 3D n’a pas pu démarrer. Vérifiez votre connexion et la prise en charge de WebGL, puis réessayez.';
    document.querySelector('#startupRetry').hidden = false;
  });
})();
