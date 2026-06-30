# AcopioVen - Guía de Arquitectura, UI/UX y Filosofía de Diseño

Este documento establece las reglas estrictas de desarrollo, UI/UX, arquitectura y la filosofía del creador de AcopioVen. **Cualquier IA que lea este documento debe adoptar inmediatamente esta postura de rigor absoluto, precisión pragmática y obsesión por la calidad del frontend**.

## 1. Filosofía General de Desarrollo
1. **Fricción Cero:** AcopioVen es una herramienta de logística de emergencia ("fricción cero"). El usuario (muchas veces en crisis, con mala señal o bajo estrés) debe poder usar la app de forma instintiva. No se admiten clics extra, tiempos de carga falsos, ni interfaces confusas.
2. **Pragmatismo Riguroso:** No sobre-ingenierizar. El stack (React + Vite + Supabase + Leaflet) se eligió por ser ligero y directo. No agregues librerías externas a menos que sea estrictamente necesario y cuente con la aprobación del creador.
3. **App Nativa en la Web:** La web app debe comportarse, sentirse y verse como una aplicación nativa de iOS/Android de clase mundial. Esto implica que las interacciones físicas, la retroalimentación táctil, las animaciones (springs) y las sombras (glassmorphism) deben ser fluidas y exactas. 
4. **Resistencia a lo "Amateur":** El creador detesta el diseño descuidado, proporciones gordas, bordes mal alineados o componentes que parezcan plantillas baratas. Todo debe verse "Premium".

## 2. Reglas Estrictas de UI/UX
- **Bottom Navigation Bar:** Es el ancla de la app móvil. Debe mantenerse flotante, estilizada y esbelta (proporciones pensadas para un iPhone 13 mini en adelante).
- **Modales tipo "Bottom Sheet":** Toda acción secundaria (detalles de acopio, directorio, ayuda, notificaciones) se abre como una hoja inferior deslizable. 
  - La interacción debe responder al arrastre (Swipe to dismiss) imitando la física de iOS.
  - Tienen bordes redondeados (`border-radius: 24px 24px 0 0`) y un 'drag handle' superior.
- **Tipografía y Colores:** 
  - Usar colores semánticos definidos en `index.css` (e.g., `var(--gray-900)`). 
  - Las alertas de validación o insignias (badges) deben ser legibles y usar la iconografía de Lucide React de forma coherente.
- **Micro-interacciones:** Los botones de "Quiero Ayudar" (Radar) o los reportes rápidos de la bitácora ("Confirmar actividad") deben proveer retroalimentación visual inmediata.
- **No obstruir el mapa:** El mapa de Leaflet es el núcleo visual. Las interfaces (chips de "Centro más cercano", barra de búsqueda superior) deben flotar delicadamente (`backdrop-filter`, `box-shadow` suave) sin devorar el espacio visual.
- **Ley del Pulgar y Centralización:** Las acciones principales (Registrar, Ayudar, Directorio) deben anclarse a la Bottom Nav Bar. Evitar iconos dispersos o redundantes en la barra superior.
- **Cero Saltos del Viewport:** En móvil, prohibido usar `autoFocus` en modales (como el de registro), ya que dispara el teclado virtual abruptamente y rompe el lienzo del mapa.
- **Onboarding sin Fricción:** Si hay soporte vía WhatsApp, inyectar parámetros `?text=` pre-llenados para que el usuario no tenga que pensar qué escribir.

## 3. Arquitectura Táctica de Notificaciones (Protocolo Amnesia)
Para evitar la saturación ("fatiga de alarma"), las alertas se dividen en 3 canales quirúrgicos:
1. **Canal Ambiental (El Ticker):** Flota pacíficamente arriba con reportes de actividad general.
2. **Canal de Proximidad:** Un chip minimalista (ej. "📍 Centro más cercano") que es efímero.
3. **Campana Táctica:** Exclusiva para emergencias (Médicos/Rescate) a menos de 20km. Posee un protocolo de "amnesia local" (localStorage) para silenciar el badge rojo una vez leído, y una purga en base de datos de 48 horas (Trigger Parasitario) para auto-limpieza.

## 4. Arquitectura del Código (`App.tsx` y Estado)
1. **App.tsx es la Máquina de Estados:** Centraliza la lógica de la UI (modal visibility, routing virtual). Si un componente crece demasiado en el futuro, se refactorizará modularmente, pero la prioridad actual es que funcione sin fricciones.
2. **Supabase como Backend Reactivo:** 
   - Tablas principales: `acopios` (ubicaciones físicas), `notes` (bitácora y confirmaciones), `roles` (médicos, rescatistas).
   - Modo Offline/Demo: Existe una capa `isDemoMode` y `DEMO_ACOPIOS` para pruebas locales si Supabase no responde, garantizando que el desarrollo frontend nunca se detenga.
3. **Modularización Defensiva (DRY):** No duplicar CSS para modales similares. Se deben reutilizar wrappers como `<SwipeableSheet className="help-sheet">` y componentes genéricos (ej. `<SupportContact />`) para no generar "código basura".
4. **Gestión de Gestos:** Los eventos táctiles (como deslizar modales) se manejaban de forma nativa para evitar dependencias pesadas (`framer-motion` se descartó en el pasado para mantener el bundle ligero y el rendimiento perfecto en dispositivos lentos).

## 5. Instrucciones para la Inteligencia Artificial
- **Contexto Rápido:** Si entras en frío a este proyecto, LEE EL CSS (`index.css`) Y EL ESTADO EN `App.tsx`. 
- **Iteración Visual:** El creador tiene "ojo de águila" para los detalles. Si te pide arreglar un margen, no cambies la arquitectura; ajusta el padding/margin con precisión matemática. 
- **Propuestas:** Nunca propongas cambios de UI sin entender el contexto de "App Nativa". Si vas a proponer un componente nuevo, diseña mentalmente cómo se abriría en un teléfono pequeño (ej. iPhone 13 mini) y cómo se cerraría con un pulgar (gestos).

> *"Cuidar el diseño de AcopioVen no es un capricho estético, es garantizar que una persona en una emergencia no pierda segundos valiosos tratando de entender qué botón presionar."*
