export default function manifest() {
  return {
    name: "AI HUB",
    short_name: "AI HUB",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0D0F",
    theme_color: "#0B0D0F",
    orientation: "portrait",
    lang: "ja",
    icons: [{src:"/icon.svg",sizes:"any",type:"image/svg+xml",purpose:"any maskable"}]
  };
}
