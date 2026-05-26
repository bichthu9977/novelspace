(function () {
  import("/frontend/js/main.js").catch(function (error) {
    console.error("Không tải được frontend module:", error);
  });
})();
