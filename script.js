(function () {
  var currentScript = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : window.location.href;
  var relativeModuleUrl = new URL("frontend/js/main.js?v=20260531-continue-toggle", currentScript).href;

  import(relativeModuleUrl).catch(function (firstError) {
    import("/frontend/js/main.js?v=20260531-continue-toggle").catch(function (secondError) {
      console.error("Không tải được frontend module:", firstError, secondError);
    });
  });
})();
