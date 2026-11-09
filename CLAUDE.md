# Regole di questa repo

## Contesto del Progetto Esperti

La mappa tecnica e il pacchetto completo del progetto stanno nella repo privata `faidu93/esperti-contesto` (`MAPPA-PROGETTI.md`, `PROGETTO-ESPERTI.md`). In una sessione cloud, se quella repo non c'è già, aggiungila subito all'inizio della sessione: se non riesci, dillo a Marco prima di modificare numeri, servizi o deploy.

Prima di modificare leggi «Legami tra le repo» in `esperti-contesto/CLAUDE.md` e sistema anche le altre repo toccate. Se la modifica cambia numeri, prezzi, formati, grafica o struttura (repo, deploy, servizi, URL), aggiorna il file giusto in `esperti-contesto` senza chiedere, fai push su `main` e di' a Marco cosa hai aggiornato. Non copiare il contenuto di quei file in questa repo.

## Costi del tab Profit

Quando Marco dà un nuovo costo, aggiungilo in `PROFIT_COSTI` (`js/10-profit.js`). Prima controlla se esiste già una riga `previsto: true` per lo stesso mese e la stessa voce: se c'è, toglila (o abbassala dell'importo, se il costo vero è minore), così i costi previsti scendono e i costi sostenuti salgono della stessa cifra. Non toccare nient'altro.
