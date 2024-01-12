# Reloj Bluetooth

Este es un pequeño proyecto personal el cual consiste en el desarrollo de un reloj despertador manejado desde una app con Bluetooth. Mi idea original era hacer un reloj con poco hardware, es decir, que la parte de configurar la hora y las alarmas sea todo a través de una app y no por botones en el equipo que puede llegar a ser más molesto.

# Hardware

Lo único que utilicé de hardware es:

- ESP32
- Buzzer Activo de 95db
- Pulsador para apagar las alarmas
- Display 7 segmentos de 4 dígitos para la hora

# Software

Para la programación del ESP32 utilicé MicroPython con el Thonny IDE, y para la aplicación móvil utilicé React Native.

# Funcionamiento

Primero que nada, uno debe abrir la app en su celular. Desde ahí toca el botón de "Conectar", y al conectarse el ESP32 envía a la app los datos de las alarmas guardadas que tiene en su memoria Flash. Aquí el usuario puede crear, eliminar, activar o desactivar las alarmas. Para que esta configuración quedé guardada debe tocar el botón de "Guardar" y entonces la app enviará la configuración al ESP32, el cuál guardará estos datos en su memoria Flash.

# Detalles y cosas a mejorar

Por el momento al iniciar el equipo, éste obtiene la hora actual mediante una consulta a un servidor NTP. Esto quiere decir que se conecta a mi WiFi y ejecuta la consulta. Los datos del WiFi los obtiene de su memoria flash, ya que le cargue un archivo wifi.json mis datos de WiFi. Obviamente esta no es la mejor solución ni mucho menos. Para este problema pensé 2 soluciones:

1. Cuando la app se conecté al ESP32, ésta le enviará automáticamente la hora actual. Pero esta solución trae el problema de que cada vez que se desconecta la alimentación del equipo, se deba esperar a que el usuario conecte con la app para configurar la hora.

2. Agregar una sección en la app para enviar los datos de WiFi (SSID y contraseña) hacia el ESP32 y que éste almacene los datos en su memoria Flash. De esta manera el usuario no debe conectarse con la app cada vez que se desconecta la alimentación del reloj.

Otro detalle que me quedó pendiente es diseñar una carcasa e imprimirla en 3D.

En el futuro trataré de agregar estas funcionalidades para una mejor experiencia.