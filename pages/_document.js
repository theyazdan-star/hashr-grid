import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="fa" dir="rtl">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800;900&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#07050d" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
