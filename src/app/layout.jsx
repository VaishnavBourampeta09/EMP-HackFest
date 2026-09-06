import "leaflet/dist/leaflet.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "../styles.css";

export const metadata = {
  title: "Escort — Maps get you home. Escort makes sure you get home safely.",
  description:
    "Escort compares walking and transit routes on the conditions along the path, explains why one ranked first, and watches a trip in progress without always-on tracking.",
  icons: { icon: "/escort-logo.png" },
};

export const viewport = {
  themeColor: "#f5f4f0",
  colorScheme: "light",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
