const chalk = require('chalk');
const figlet = require('figlet');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const LibConnection = require('./lib-connection');

// Ruta donde se encuentran tus complementos
const PLUGINS_PATH = path.join(__dirname, 'plugins');

// Almacén optimizado donde se guardarán los complementos cargados
let plugins = new Map();

// Configuración para máxima velocidad
const CONFIG = {
    omitirRegistrosInnecesarios: true,
    procesarMensajesEnParalelo: true,
    recargaRapida: true,
    limitarProcesos: false
};

/**
 * Muestra el nombre del bot en grande y con estilo
 */
function mostrarTitulo() {
    console.log(
        chalk.blueBright.bold(
            figlet.textSync('UltraBot', {
                font: 'Big',
                horizontalLayout: 'default',
                verticalLayout: 'default'
            })
        )
    );
    console.log(chalk.cyan('='.repeat(60)));
    console.log(chalk.greenBright('🤖 BOT DE WHATSAPP - MODO ALTO RENDIMIENTO ACTIVADO'));
    console.log(chalk.greenBright('⚡ Versión: 2.1.0 | Velocidad: MÁXIMA'));
    console.log(chalk.cyan('='.repeat(60)) + '\n');
}

/**
 * Carga o recarga todos los complementos de forma ultrarrápida
 */
async function cargarPlugins() {
    const inicio = performance.now();
    plugins.clear();

    if (!fs.existsSync(PLUGINS_PATH)) {
        if (!CONFIG.omitirRegistrosInnecesarios) {
            console.log(chalk.yellow('⚠️ La carpeta de complementos no existe, se creará automáticamente...'));
        }
        fs.mkdirSync(PLUGINS_PATH, { recursive: true });
        if (!CONFIG.omitirRegistrosInnecesarios) {
            console.log(chalk.green('✅ Carpeta creada correctamente\n'));
        }
        return;
    }

    // Lectura rápida de archivos
    const archivos = fs.readdirSync(PLUGINS_PATH, { withFileTypes: true })
        .filter(archivo => archivo.isFile() && archivo.name.endsWith('.js'))
        .map(archivo => archivo.name);

    if (archivos.length === 0) {
        if (!CONFIG.omitirRegistrosInnecesarios) {
            console.log(chalk.yellow('⚠️ No se encontraron complementos para cargar\n'));
        }
        return;
    }

    if (!CONFIG.omitirRegistrosInnecesarios) {
        console.log(chalk.blueBright(`🔄 Cargando ${archivos.length} complementos...`));
    }

    // Carga paralela para reducir tiempos
    const promesasCarga = archivos.map(async (archivo) => {
        try {
            const rutaCompleta = path.join(PLUGINS_PATH, archivo);
            // Eliminación inmediata de caché para actualización instantánea
            delete require.cache[require.resolve(rutaCompleta)];
            
            const complemento = require(rutaCompleta);
            
            if (complemento.nombre && typeof complemento.ejecutar === 'function') {
                plugins.set(complemento.nombre, complemento);
                if (!CONFIG.omitirRegistrosInnecesarios) {
                    console.log(chalk.green(`✅ Complemento cargado: ${archivo}`));
                }
            }
        } catch (error) {
            if (!CONFIG.omitirRegistrosInnecesarios) {
                console.log(chalk.red(`❌ Error al cargar ${archivo}: ${error.message}`));
            }
        }
    });

    await Promise.all(promesasCarga);

    const tiempoTotal = (performance.now() - inicio).toFixed(2);
    if (!CONFIG.omitirRegistrosInnecesarios) {
        console.log(chalk.greenBright.bold(`\n✅ Carga completada en ${tiempoTotal}ms | Complementos activos: ${plugins.size}\n`));
    }
}

/**
 * Procesa cada mensaje de forma eficiente y rápida
 */
async function procesarMensaje(cliente, mensaje) {
    // Filtrado rápido para no procesar lo que no es necesario
    if (!mensaje || !mensaje.body) return;

    // Ejecución según configuración de velocidad
    if (CONFIG.procesarMensajesEnParalelo) {
        // Ejecuta todos los complementos al mismo tiempo, sin esperar uno tras otro
        const tareas = [];
        for (const complemento of plugins.values()) {
            tareas.push(
                (async () => {
                    try {
                        await complemento.ejecutar(cliente, mensaje);
                    } catch (err) {
                        if (!CONFIG.omitirRegistrosInnecesarios) {
                            console.log(chalk.red(`⚠️ Error en complemento ${complemento.nombre || 'desconocido'}: ${err.message}`));
                        }
                    }
                })()
            );
        }
        // Espera a que terminen todas pero sin bloquear el flujo
        Promise.allSettled(tareas);
    } else {
        // Ejecución secuencial pero optimizada
        for (const complemento of plugins.values()) {
            try {
                await complemento.ejecutar(cliente, mensaje);
            } catch (err) {
                if (!CONFIG.omitirRegistrosInnecesarios) {
                    console.log(chalk.red(`⚠️ Error en complemento ${complemento.nombre || 'desconocido'}: ${err.message}`));
                }
            }
        }
    }
}

/**
 * Inicia todo el funcionamiento del bot con máxima optimización
 */
async function iniciarBot() {
    try {
        // Mostramos el título llamativo
        mostrarTitulo();

        // Cargamos los complementos de inmediato
        await cargarPlugins();

        // Iniciamos la conexión
        const conexion = new LibConnection();
        const client = await conexion.connect();

        // Activamos configuraciones internas para mayor velocidad
        client.setMaxListeners(0); // Eliminamos límite de eventos para no tener restricciones
        client.pupPage.setBypassCSP(true);
        client.pupPage.setJavaScriptEnabled(true);

        client.on('ready', () => {
            console.log(chalk.greenBright.bold('🚀 ¡UltraBot funcionando a máxima velocidad! Listo para responder al instante\n'));
        });

        // Reinicio y recarga automática ultrarrápida
        client.on('disconnected', async (motivo) => {
            console.log(chalk.red.bold(`\n🔌 Desconexión detectada: ${motivo}`));
            console.log(chalk.yellow.bold('♻️ Reinicio automático inmediato...\n'));

            // Recarga rápida sin procesos innecesarios
            if (CONFIG.recargaRapida) {
                await cargarPlugins();
            }

            // Inicio inmediato sin tiempos de espera prolongados
            setImmediate(() => iniciarBot());
        });

        // Recepción y procesamiento de mensajes optimizado
        client.on('message_create', async (mensaje) => {
            // Enviamos el procesamiento para que no bloquee la recepción de otros mensajes
            setImmediate(() => procesarMensaje(client, mensaje));
        });

    } catch (error) {
        console.log(chalk.red.bold(`\n❌ Error del sistema: ${error.message}`));
        console.log(chalk.yellow.bold('🔁 Reinicio automático en 2 segundos...\n'));
        
        // Tiempo de espera reducido ante errores
        setTimeout(() => iniciarBot(), 2000);
    }
}

// Inicio inmediato
setImmediate(() => iniciarBot());
                  
