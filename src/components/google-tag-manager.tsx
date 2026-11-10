import Script from "next/script";
import { googleConsent } from "@/features/privacy/preferences";

export default function GoogleTagManager({
  analytics,
}: {
  analytics: boolean;
}) {
  return (
    <Script id="google-tag-manager-init" strategy="afterInteractive">
      {`
          window.dataLayer = window.dataLayer || [];
          window.gtag = function gtag() { window.dataLayer.push(arguments); };
          window.gtag('consent', 'default', ${JSON.stringify(googleConsent({ analytics: false, marketing: false }))});
          window.gtag('consent', 'update', ${JSON.stringify(googleConsent({ analytics, marketing: true }))});
          window.dataLayer.push({'gtm.start': new Date().getTime(), event: 'gtm.js'});
          const script = document.createElement('script');
          script.async = true;
          script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-MWND8GRB';
          document.head.appendChild(script);
        `}
    </Script>
  );
}
