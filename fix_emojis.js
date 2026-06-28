
const fs = require("fs");
let app = fs.readFileSync("src/App.tsx", "utf8");

const imports = "import { Lock, Plus, List as ListIcon, MapPin, HelpCircle, Hospital, Package, Phone, MessageCircle, Map as MapIcon, Search, User, Pointer } from \"lucide-react\";\n";
if (!app.includes("lucide-react")) {
    app = app.replace("import \"./index.css\";", "import \"./index.css\";\n" + imports);
}

// Map markers
app = app.replace(/const emoji = type === .hospital. \? .??. : type === .iglesia. \? .?. : .??.;/g, "const emoji = type === `hospital` ? `??` : type === `iglesia` ? `?` : `??`; // We keep emoji for leaflet marker");

// Top bar
app = app.replace(/<div className="brand-icon">??<\/div>/g, "<div className=\"brand-icon\"><Package size={24} color=\"white\" /></div>");
app = app.replace(/>??<\/button>/g, "><Lock size={18} /><\/button>");
app = app.replace(/>\+ <span>Agregar<\/span><\/button>/g, "><Plus size={18} /> <span>Agregar<\/span><\/button>");
app = app.replace(/>?? <span>Ver lista<\/span><\/button>/g, "><ListIcon size={18} /> <span>Ver lista<\/span><\/button>");
app = app.replace(/title="Mi ubicación">??<\/button>/g, "title=\"Mi ubicación\"><MapPin size={18} /><\/button>");
app = app.replace(/title="Cómo funciona">?<\/button>/g, "title=\"Cómo funciona\"><HelpCircle size={18} /><\/button>");

// Modals auth
app = app.replace(/<h2>?? Acceso a Líderes<\/h2>/g, "<h2 style={{display:`flex`,alignItems:`center`,gap:`8px`}}><Lock size={20} /> Acceso a Líderes<\/h2>");

// Help modal
app = app.replace(/<h2>? ¿Cómo funciona\?<\/h2>/g, "<h2 style={{display:`flex`,alignItems:`center`,gap:`8px`}}><HelpCircle size={20} /> ¿Cómo funciona?<\/h2>");
app = app.replace(/<span className="help-step-icon">?? \/ ?<\/span>/g, "<span className=\"help-step-icon\"><Hospital size={16} /> / <Hospital size={16} /><\/span>");
app = app.replace(/<span className="help-step-icon">??<\/span>/g, "<span className=\"help-step-icon\"><Package size={16} /><\/span>");
app = app.replace(/<span className="help-step-icon">?? \/ ??<\/span>/g, "<span className=\"help-step-icon\"><Phone size={16} /> / <MessageCircle size={16} /><\/span>");
app = app.replace(/<span className="help-step-icon">??<\/span>/g, "<span className=\"help-step-icon\"><Lock size={16} /><\/span>");

// List modal
app = app.replace(/<h2>?? /g, "<h2 style={{display:`flex`,alignItems:`center`,gap:`8px`}}><ListIcon size={20} /> ");
app = app.replace(/placeholder="?? Buscar /g, "placeholder=\"Buscar ");
app = app.replace(/\{loc\.type === .hospital. \? .??. : loc\.type === .iglesia. \? .?. : .??.\}/g, "{loc.type === `hospital` ? <Hospital size={20} /> : loc.type === `iglesia` ? <Hospital size={20} /> : <Package size={20} />}");
app = app.replace(/?? A /g, "");
app = app.replace(/?? /g, "");
app = app.replace(/?? /g, "");
app = app.replace(/<div className="details-type">\{selectedLoc\.type === .hospital. \? .?? Hospital. : selectedLoc\.type === .iglesia. \? .? Iglesia. : .?? Centro de Acopio.\}<\/div>/g, "<div className=\"details-type\">{selectedLoc.type === `hospital` ? <><Hospital size={14}/> Hospital</> : selectedLoc.type === `iglesia` ? <><Hospital size={14}/> Iglesia</> : <><Package size={14}/> Centro de Acopio</>}</div>");

app = app.replace(/<strong>?? Contacto \/ Líder:<\/strong>/g, "<strong style={{display:`flex`,alignItems:`center`,gap:`4px`}}><User size={16} /> Contacto / Líder:<\/strong>");
app = app.replace(/>?? Llamar/g, "><Phone size={16} /> Llamar");
app = app.replace(/>?? WhatsApp/g, "><MessageCircle size={16} /> WhatsApp");
app = app.replace(/<strong>?? ¿Qué se necesita\?<\/strong>/g, "<strong style={{display:`flex`,alignItems:`center`,gap:`4px`}}><ListIcon size={16} /> ¿Qué se necesita?<\/strong>");
app = app.replace(/>??? Abrir ruta en Google Maps/g, "><MapIcon size={16} /> Abrir ruta en Google Maps");

// Chooser modal
app = app.replace(/<span className="chooser-icon">??<\/span>/g, "<span className=\"chooser-icon\"><MapPin size={24} /><\/span>");
app = app.replace(/<span className="chooser-icon">??<\/span>/g, "<span className=\"chooser-icon\"><Pointer size={24} /><\/span>");

// Form modal
app = app.replace(/<h2>\{editingId \? .?? Editar Acopio. : .?? Nuevo Centro.\}<\/h2>/g, "<h2 style={{display:`flex`,alignItems:`center`,gap:`8px`}}>{editingId ? <><Hospital size={20} /> Editar Acopio</> : <><Package size={20} /> Nuevo Centro</>}</h2>");
app = app.replace(/<span className="selected-location-icon">??<\/span>/g, "<span className=\"selected-location-icon\"><MapPin size={24} /><\/span>");
app = app.replace(/<label>?? Nombre Contacto<\/label>/g, "<label style={{display:`flex`,alignItems:`center`,gap:`4px`}}><User size={14} /> Nombre Contacto<\/label>");
app = app.replace(/<label>?? Teléfono<\/label>/g, "<label style={{display:`flex`,alignItems:`center`,gap:`4px`}}><Phone size={14} /> Teléfono<\/label>");
app = app.replace(/<label>?? ¿Qué se necesita\? \(Opcional\)<\/label>/g, "<label style={{display:`flex`,alignItems:`center`,gap:`4px`}}><ListIcon size={14} /> ¿Qué se necesita? (Opcional)<\/label>");

fs.writeFileSync("src/App.tsx", app);

