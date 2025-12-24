# Codenames Online

A multiplayer word guessing game based on the popular board game Codenames.

---

## 🇳🇱 Spelregels (Nederlands)

### Doel van het Spel
Het doel is om alle woorden van je team te vinden voordat het andere team dat doet.

### Teams
- Twee teams: **Rood** en **Blauw**
- Elke team heeft een **Kapitein** (Spymaster) en **Spelers** (Operatives)

### Het Speelbord
- 25 kaarten met woorden
- Sommige behoren tot Rood, sommige tot Blauw
- Sommige zijn neutraal (beige)
- Één is de **Moordenaar** (zwart) - vermijd deze!

### Hoe te Spelen

1. **Kapitein geeft een hint**
   - De Kapitein ziet welke kaarten bij zijn team horen
   - Hij/zij geeft een hint: één woord + een getal
   - Het getal geeft aan hoeveel kaarten bij de hint horen

2. **Spelers raden**
   - Spelers bespreken en kiezen kaarten
   - Als ze een kaart van hun team kiezen: punt!
   - Als ze een neutrale kaart kiezen: beurt voorbij
   - Als ze een kaart van het andere team kiezen: punt voor tegenstander
   - Als ze de Moordenaar kiezen: **direct verloren!**

3. **Beurt beëindigen**
   - Spelers kunnen hun beurt beëindigen wanneer ze willen
   - Dan is het andere team aan de beurt

### Winnen
- Eerste team dat al hun woorden vindt, wint!
- Of: het andere team kiest de Moordenaar

### Timer
- Elke beurt heeft een tijdslimiet
- Als de tijd op is, eindigt de beurt automatisch

---

## 🇺🇦 Правила Гри (Українська)

### Мета Гри
Мета гри — знайти всі слова своєї команди раніше, ніж це зробить суперник.

### Команди
- Дві команди: **Червона** та **Синя**
- Кожна команда має **Капітана** (Spymaster) та **Гравців** (Operatives)

### Ігрове Поле
- 25 карток зі словами
- Деякі належать Червоним, деякі — Синім
- Деякі нейтральні (бежеві)
- Одна — **Вбивця** (чорна) — уникайте її!

### Як Грати

1. **Капітан дає підказку**
   - Капітан бачить, які картки належать його команді
   - Він/вона дає підказку: одне слово + число
   - Число вказує, скільки карток пов'язані з підказкою

2. **Гравці вгадують**
   - Гравці обговорюють та обирають картки
   - Якщо обрали картку своєї команди: очко!
   - Якщо обрали нейтральну картку: хід закінчено
   - Якщо обрали картку суперника: очко супернику
   - Якщо обрали Вбивцю: **миттєва поразка!**

3. **Завершення ходу**
   - Гравці можуть завершити хід коли завгодно
   - Потім хід переходить до іншої команди

### Перемога
- Перша команда, яка знайшла всі свої слова, перемагає!
- Або: інша команда обирає Вбивцю

### Таймер
- Кожен хід має обмеження часу
- Коли час вичерпано, хід завершується автоматично

---

## Features

- 🌐 Bilingual interface (Dutch/Ukrainian)
- 🎮 Real-time multiplayer via Socket.io
- 👁️ Spymaster view toggle
- ⏱️ Team timers with sound effects
- 💡 Clue history tracking
- 🔀 Multiple word sets
- 🕵️ Traitor mode (optional)
