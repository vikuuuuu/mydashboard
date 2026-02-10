import "./globals.css";
import FirebaseAnalyticsInit from "@/components/FirebaseAnalyticsInit";

export const metadata = {
  title: "File Dashboard",
  description: "Firebase-protected file conversion dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <FirebaseAnalyticsInit />
        {children}
      </body>
    </html>
  );
}
