function doGet() {
  const props = PropertiesService.getScriptProperties();
  const tmpl = HtmlService.createTemplateFromFile("timeline_static");
  tmpl.FORM_URL  = props.getProperty("FORM_URL")  || "#";
  tmpl.GCDO_EMAIL = props.getProperty("GCDO_EMAIL") || "gcdo@example.com";
  return tmpl.evaluate()
    .setTitle("GCDO Collaboration Timeline")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
