# CLAUDE.md – formcycle: Hybride Adresssuche (`fc-plugin-adresssuche`)

## Überblick

- **Version:** 1.0.1 (noch nicht im Store; live getestet auf einer formcycle-Cloud-Testinstallation und über einen Frontend-Server)
- **Ziel:** formcycle ab 8.5.0 (Manifest `formcycle-version-requirement: 8.5.0`), gebaut gegen 8.5.5, Mandanten-Plugin
- **Ersetzt:** `hybrid-address-search.js` V12 (Bayern Ortssuchdienst + OpenPLZ, Kempten-Beschränkung), das den API-Key im Browser hatte
- **Plugin-Key (Elementschlüssel):** `1ea33546-3a84-4c89-a531-e0b657475bde` – **nie ändern**
- **Servlet-Name:** `hybridAdresssuche` – steht in ausgelieferten Formularen, **nie ändern**
- Package `de.hybridadresssuche.fc`, Bundle-Keys `de.hybridadresssuche.fc.*`
- Java 11 strikt (keine Text Blocks, Records, Switch-Expressions, `instanceof`-Pattern, `Stream.toList()`)

## Git

- `origin` → `https://github.com/N64Freak1986/XimaBundesweiteAdresssuche.git` (öffentlich!). Vorgänger-Skript-Versionen liegen in der Historie (nur Platzhalter-Keys).
- Pushen nur nach Rückfrage.
- **Nie** echte API-Keys committen. Die alte Datei mit Key (`../Adresssuche.js.txt`) liegt bewusst außerhalb des Repos.

## Befehle (Windows)

```powershell
$mvn = "C:\Users\Benedikt\.m2\wrapper\dists\apache-maven-3.8.5-bin\5i5jha092a3i37g0paqnfr15e0\apache-maven-3.8.5\bin\mvn.cmd"
& $mvn clean package                       # 33 Tests + target/fc-plugin-adresssuche-1.0.1.jar
& $mvn "-Dxfc.version=8.5.0" clean test    # Mindestversion
unzip -p dist/fc-plugin-adresssuche-1.0.1.jar META-INF/MANIFEST.MF
```

Nach dem Build die JAR nach `dist/` und in den übergeordneten Ordner kopieren.

## Architektur

- `AdresssucheServletPlugin` (`IPluginServletAction`): `GET plugin?name=hybridAdresssuche&client-id=<id>&q=...[&restriction=<css-klasse>]`. Prüft `q` (3–120 Zeichen, Whitelist), Anfragelimit pro FRQ-Session/Session/IP plus globale Obergrenze (Schlüssel `*global*`), ruft `BayernOrtssucheClient`, filtert nach Ortsbeschränkung, antwortet über `JsonServletResponses` (formcycles `ServletResponse`, nötig für Frontend-Server).
- `BayernOrtssucheClient`: `https://geoservices.bayern.de/services/ortssuche/v1/adressen/<q>?filter=address&srid=31468&fuzzy=false&api_key=...`; nur HTTPS, keine Redirects, 5 s Timeout, max. 1 MB, LRU-Cache 1000 Einträge / 10 min. Labels werden von `<b>` befreit. Exceptions nie mit URL loggen (enthält Key).
- `AdresssuchePreRenderPlugin`: legt `XFC_METADATA.pluginResults.<Plugin>.hybridAdresssuche` an (`servletUrl` inkl. `client-id`, `restrictions`, `bayernEnabled`, `debug`). Nie den Key.
- `AdresssucheResourcePlugin`: Formular-Ressource `hybrid-address-search.js` aus `src/main/resources/de/hybridadresssuche/fc/` (ES5).
- `AdresssucheSettings`: Einstellungen werden in **jedem** `initialize()` als Instanzfeld gelesen, kein statischer Speicher (Mandantentrennung).
- `Restriction`: Format `css-klasse=Name|Suchzusatz|PLZ,PLZ;...`, leer = Kempten-Standard, `-` = keine.

## Browser-Skript

- Kompatibel zu V12: gleiche Feldklassen, `CONFIG`, `window.HybridAddressSearch` (+ `pluginVersion`, `getServletUrls`).
- Servlet-URL-Kandidaten: PreRender-`servletUrl` → `XFC_METADATA.urls.plugin` → Pfad vor `/form/` + `/plugin` → relativ; bei 404 nächster Kandidat. `client-id` sonst aus `mid=` der Ressourcen-URLs.
- Läuft nicht, wenn schon ein `window.HybridAddressSearch` ohne `pluginVersion` existiert (altes Skript noch eingebunden).
- Trefferliste per `.text()` (V12 nutzte HTML-Strings → XSS über API-Daten möglich).
- Versionskonstanten im JS (`PLUGIN_VERSION`, `SERVLET_NAME`, `META_KEY`) sind per Test an `Constants` gekoppelt.

## Tests

`AdresssuchePluginTest` (21) und `AdresssucheSecurityTest` (12, SEC-01–SEC-12, Bericht in `docs/SECURITY_REPORT.md`).

`AdresssuchePluginTest`: Ortsbeschränkung, Einstellungen, Bundle-Keys (Map-Key == `getName()`), Query-Prüfung, URL-Kodierung, Label-Bereinigung, Cache, Fehlerfälle ohne Key-Leck, Servlet-Antworten (200/400/429/502/503), PreRender ohne Key, JS ohne Key.

Manuell geprüft (29.10.2026): Live-Suche über `BayernOrtssucheClient` (echter Key, falscher Key → 403) und Browser-Test des Skripts mit Mock-Servlet (Trefferliste, Übernahme/Sperre, Kempten-Filter, fremde PLZ).

Live geprüft (29.10.2026, Testinstallation, Mandant 852): PreRender unter `XFC_METADATA.pluginResults.hybridAdresssuchePreRender.hybridAdresssuche`, Servlet `/plugin?name=hybridAdresssuche&client-id=852` (ohne `client-id` → 404), Ressource per `ressource?mid=852&plgname=hybridAdresssucheResource&name=hybrid-address-search.js`.

## Gotchas

- 1.0.1 hat die technischen Namen (Servlet, Ressource, Einstellungs-Schlüssel, Package) gegenüber 1.0.0 geändert. Installationen mit 1.0.0 müssen den API-Key neu eintragen und die Formular-Ressource neu auswählen. Ab jetzt Namen nicht mehr ändern.

- Das Anfragelimit greift im Browser pro Session (formcycle setzt ein HttpOnly-JSESSIONID-Cookie, das `/plugin` mitbekommt); Clients ohne Cookie landen im IP-Bucket. Eine neue Session pro Seitenaufruf umgeht das Besucherlimit → deshalb zusätzlich die globale Obergrenze.
- Ob `getRemoteAddr()` hinter einem Reverse-Proxy die echte Client-IP ist, hängt von der Tomcat-Konfiguration ab (RemoteIpValve). Ohne Valve teilen sich alle cookielosen Clients einen Bucket.

## Offen

- Test über den Frontend-Server bei der Stadt Kempten (`/frontend-server/plugin?...`).
- Alten API-Key beim LDBV sperren/neu ausstellen lassen.
- Ggf. Store-Einreichung (PDF-Doku, Logo, Beschreibung ≤ 1000 Zeichen).
