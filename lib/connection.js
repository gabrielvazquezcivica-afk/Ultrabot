import { default as makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import readline from 'readline';

// Configuración para leer entradas por consola
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Título grande y con colores
console.log(chalk.blue.bold(`
╔═════════════════════════════════════════════════╗
║                                                 ║
║              CONEXIÓN ULTRABOT                  ║
║                                                 ║
╚═════════════════════════════════════════════════╝
`));

// Función principal de conexión
async function iniciarConexion(modo, numeroUsuario = null) {
    // Carpeta donde se guardarán tus datos de sesión
    const { state, saveCreds } = await useMultiFileAuthState('./sesion');

    // Configuración de conexión
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: modo === 'qr',
        syncFullHistory: false
    });

    // Guardar cambios en los datos de acceso
    sock.ev.on('creds.update', saveCreds);

    // Control de estado de conexión
    sock.ev.on('connection.update', (actualizacion) => {
        const { connection, qr, code, error } = actualizacion;

        if (connection === 'open') {
            console.log(chalk.green.bold('✅ ¡CONECTADO CORRECTAMENTE A WHATSAPP!'));
            console.log(chalk.gray('→ Ya puedes usar todas las funciones del bot'));
        }

        if (connection === 'close') {
            console.log(chalk.red('❌ Conexión cerrada'));
            if (error) console.log(chalk.red(`→ Motivo: ${error.message || 'Desconocido'}`));
            console.log(chalk.yellow('→ Intentando restablecer conexión automáticamente...'));
        }

        // Mostrar código QR si se eligió esa opción
        if (modo === 'qr' && qr) {
            console.log(chalk.yellow.bold('\n📲 ESCANEA ESTE CÓDIGO QR:'));
            console.log(chalk.gray('→ Abre WhatsApp > Dispositivos vinculados > Vincular un dispositivo'));
        }

        // Mostrar código de 8 dígitos si se eligió esa opción
        if (modo === 'codigo' && code) {
            console.log(chalk.cyan.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${code}`));
            console.log(chalk.gray(`→ Para el número: ${numeroUsuario}`));
            console.log(chalk.gray('→ Ingresa este código en tu aplicación de WhatsApp'));
        }
    });

    // Generar código de vinculación si se eligió por número
    if (modo === 'codigo' && numeroUsuario) {
        try {
            await sock.requestPairingCode(numeroUsuario);
        } catch (err) {
            console.log(chalk.red(`⚠️ Error al generar el código: ${err.message}`));
            rl.close();
        }
    }
}

// Exportación correcta para usarlo en el archivo principal
export default iniciarConexion;
