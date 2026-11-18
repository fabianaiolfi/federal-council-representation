# Wie gut bildet der Bundesrat die Bevölkerung ab?

Wie gut bildet die Zusammensetzung des Schweizer Bundesrats die Vielfalt der in der Schweiz lebendend Bevölkerung ab? Diese Seite misst die [deskriptive Repräsentation](https://en.wikipedia.org/wiki/Political_representation#Descriptive_representation) des Bundesrats. Es vergleicht die sieben Mitglieder der Landesregierung mit der Schweizer Bevölkerung nach Geschlecht, Partei, Sprache, Alter und Grossregion, für jede Zusammensetzung seit 1848.

[Mehr lesen](#)

warum überhaupt?
- hohe deskriptive repräsentation in jedem politischen gremium (zb parlamente oder andere regierungen) ist erstrebenswert, jedoch nicht das einzige kriterium beim messen der zusammenstellung. 
- andere kriterien zb substantive repräsentation, sind auch wichtig

## Methode

Der Vergleich zwischen Bundesrate und Bevölkerung lässt sich mit dem _Rose Index_ messen. Dieser Index basiert auf dem [_Loosemore–Hanby index_
](https://en.wikipedia.org/wiki/Loosemore%E2%80%93Hanby_index), das die Disproportionalität eines Wahlsystems misst.

```
Rose Index = 100 - (0.5 × Σ |Anteil Bundesrat pro Gruppe - Anteil Bevölkerung pro Gruppe|)
```

Je ähnlicher die Zusammensetzung des Bundesrats im Vergleich zur Bevölkerung, desto höher die Übereinstimmung. 

Ein Beispiel: Heute ist der Frauenanteil im Bundesrat mit zwei Sitzen bei 28.6 %, in der Bevölkerung ist der Frauenanteil 50.3 %. Der Männeranteil im Bundesrat ist 71.4 %, in der Bevölkerung 49.7 %. Diese Werte führen zu folgendem _Rose Index_:

```
Rose Index = 100 - (0.5 × (|28.6 - 50.3| + |71.4 - 49.7|) ) = 78.3 %
```

Der _Rose Index_ wird in Prozent ausgedrückt. Wenn der Bundesrat die genau gleiche Zusammensetzung hat wie die Bevölkerung, gäbe das eine Übereinstimmung von 100 %. Weil der Bundesrat aber nur sieben Sitze hat, sind 100 % fast nie erreichbar.

## Wahl der Kategorien

Auf dieser Seite werden Übereinstimmungen bezüglich Geschlecht, Partei, Sprache, Alter und Grossregion berechnet. Die Wahl der Kategorien «Sprache» und «Grossregion» basiert auf dem Wortlaut der Schweizer Bundesverfassung, dass «[die Landesgegenden und Sprachregionen angemessen vertreten sind](https://www.fedlex.admin.ch/eli/cc/1999/404/de#art_175)». Die weiteren Kategorien «Geschlecht», «Partei» und «Alter» wurden gewählt, weil diese offensichtlich sind in ihrer Vermittlung und das Bundesamt für Statistik (BFS) die Datengrundlage dafür bietet (siehe [Quellen](quellen.html)). Diese Liste an Kategorien ist nicht abschliessend und kann beliebig ergänzt werden, z.B. mit religiöser Zugehörigkeit, sexuelle Orientierung oder Ausbildung und Beruf.

Die totale Übereinstimmung ist der Durchschnitt aller einzelnen _Rose Index_-Werte.
