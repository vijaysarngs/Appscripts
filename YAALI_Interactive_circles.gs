function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Donut Radial Menu')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
