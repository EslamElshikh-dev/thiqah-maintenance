const store = new URLSearchParams(location.search).get('store');
const names = { 'google-play': 'Google Play', 'app-store': 'App Store' };
document.querySelector('#store-name').textContent = names[store] || 'Google Play وApp Store';
