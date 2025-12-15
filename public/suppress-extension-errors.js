// Suppress wallet extension errors
(function() {
  var originalError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    if (
      (message && message.toString().includes('chrome.runtime.sendMessage')) ||
      (message && message.toString().includes('Extension ID')) ||
      (source && source.includes('chrome-extension')) ||
      (source && source.includes('inpage.js'))
    ) {
      return true; // Suppress error
    }
    if (originalError) {
      return originalError(message, source, lineno, colno, error);
    }
    return false;
  };

  window.addEventListener('error', function(event) {
    if (
      (event.message && event.message.includes('chrome.runtime.sendMessage')) ||
      (event.message && event.message.includes('Extension ID')) ||
      (event.filename && event.filename.includes('chrome-extension')) ||
      (event.filename && event.filename.includes('inpage.js'))
    ) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  }, true);

  window.addEventListener('unhandledrejection', function(event) {
    var message = event.reason && (event.reason.message || event.reason.toString());
    if (
      message &&
      (message.includes('chrome.runtime.sendMessage') || message.includes('Extension ID'))
    ) {
      event.preventDefault();
    }
  });
})();
