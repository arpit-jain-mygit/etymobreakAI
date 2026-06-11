# EtymobreakAi

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.0.0.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Inventory Contract

The app reads `public/root-inventory.json` as an array of analysis records. Each record should be self-contained and match the structure below.

Required shape:

```json
{
  "query": "fracture",
  "mode": "word",
  "title": "FRACTURE",
  "summary": "A breakdown of fract + ure and the word family built from the fract root.",
  "literalMeaningFormula": "fract + ure",
  "literalMeaningArrow": "➡️ a break",
  "literalMeaning": "root + suffix/word ending",
  "actualMeaning": "A break.",
  "breakdown": [
    {
      "index": 1,
      "label": "fract",
      "type": "root",
      "meaning": "break",
      "source": "From Latin frangere/fractus = to break.",
      "otherExamples": ["fracture", "fraction", "fractious"]
    },
    {
      "index": 2,
      "label": "ure",
      "type": "suffix",
      "meaning": "act, process, result, or condition",
      "source": "A noun-forming suffix used for the result/state of an action, as in fracture, closure, exposure.",
      "otherExamples": ["fracture", "closure", "exposure", "pressure"]
    }
  ],
  "wordFamily": [
    {
      "word": "Fracture",
      "meaning": "a break",
      "breakdown": [
        {
          "index": 1,
          "label": "fract",
          "type": "root",
          "meaning": "break",
          "source": "From Latin frangere/fractus = to break.",
          "otherExamples": ["fracture", "fraction", "fractious"]
        },
        {
          "index": 2,
          "label": "ure",
          "type": "suffix",
          "meaning": "act, process, result, or condition",
          "source": "A noun-forming suffix used for the result/state of an action, as in fracture, closure, exposure.",
          "otherExamples": ["fracture", "closure", "exposure", "pressure"]
        }
      ],
      "exampleSentence": "Fracture means a break."
    }
  ],
  "familyMemory": [
    { "term": "fract", "meaning": "break" }
  ],
  "notes": ["Source slide: 77", "Root origin: Latin"],
  "slideNumber": 77,
  "rootFamily": {
    "root": "fract",
    "meaning": "break",
    "origin": "Latin",
    "source": "From Latin frangere/fractus = to break."
  }
}
```

Contract notes:

- Keep `wordFamily[].breakdown[]` when you want suffix/root family details to survive render.
- Keep `breakdown[].otherExamples[]` for part-level example words.
- If a field is not known, leave it blank or empty rather than omitting the key.
- `otherWords` and `relatedWords` are no longer part of the inventory contract.

## Google Registration

The app now gates the main experience behind Google sign-in and a basic profile form.

- Frontend reads the Google client ID from `GET /config` on the FastAPI backend.
- Set `GOOGLE_CLIENT_ID` in Render for `etymobreak-ai-api`.
- The profile fields saved by the app are `firstName`, `lastName`, and `country`.
- Profile data is stored locally in the browser for now, so the user stays signed in on the same device.
