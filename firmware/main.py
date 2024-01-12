from machine import Pin, Timer, RTC
import utime
import ubluetooth
import json
import ntptime
import network
from tm1637 import TM1637

# Configuración de los pines CLK y DIO del TM1637
clk_pin = Pin(23) 
dio_pin = Pin(22) 

# Pin del buzzer
timbre = Pin(21,Pin.OUT)
timbre.value(0) # Lo pongo en cero
# Pin del boton para apagar la alarma
stop = Pin(19,Pin.IN)

# Inicialización del objeto TM1637
tm = TM1637(clk=clk_pin, dio=dio_pin)

# Muesto 00:00 por defecto
tm.numbers(0, 0)

# Establece la configuración de la red WiFi
def getWifi():
    try:
        with open("wifi.json", "r") as f:
            content = f.read()
            # Verificar si el contenido está vacío
            if content:
                wifi = json.loads(content)
                return wifi
            else:
                print("El archivo 'wifi.json' está vacío.")
                return []
    except OSError:
        return []  # Devuelve una lista vacía si no se puede cargar el archivo
    
wifi = getWifi() # Obtengo los datos de wifi guardados en wifi.json
SSID = wifi['ssid']
PASSWORD = wifi['password']

# Me conecto al wifi
sta_if = network.WLAN(network.STA_IF)
sta_if.active(True)
sta_if.connect(SSID, PASSWORD)

# Espera a que la conexión se establezca
while not sta_if.isconnected():
    pass

# Obtén la hora desde un servidor NTP
ntptime.settime()

# Configura el RTC con la hora obtenida
rtc = RTC()
current_time = utime.localtime()
hour = 0
if current_time[3] >= 3:
    hour = current_time[3]-3
else:
    hour = current_time[3] + 21

rtc.datetime((current_time[0], current_time[1], current_time[2], 0, hour, current_time[4], current_time[5], 0))

# Clase para manejar el almacenamiento de alarmas en flash
class AlarmStorage:

    def __init__(self, filename="alarms.json"):
        self.filename = filename

    def save_alarms(self, alarms):
        with open(self.filename, "w") as f:
            f.write(json.dumps(alarms))

    def load_alarms(self):
        try:
            with open(self.filename, "r") as f:
                content = f.read()
                # Verificar si el contenido está vacío
                if content:
                    alarms = json.loads(content)
                    return alarms
                else:
                    print("El archivo 'alarmas.json' está vacío.")
                    return []
        except OSError:
            return []  # Devuelve una lista vacía si no se puede cargar el archivo

# Uso del almacenamiento de alarmas
alarm_storage = AlarmStorage()


class BLE():

    def __init__(self, name):
        self.alarms = alarm_storage.load_alarms()
        self.name = name
        self.ble = ubluetooth.BLE()
        self.ble.active(True)

        self.connected_status = False  # Estado de conexión

        self.led = Pin(2, Pin.OUT)
        self.timer1 = Timer(0)
        self.timer2 = Timer(1)

        self.disconnected()
        self.ble.irq(self.ble_irq)
        self.register()
        self.advertiser()
        
    def getAlarms(self):
        return self.alarms

    def connected(self):
        self.timer1.deinit()
        self.timer2.deinit()
        self.connected_status = True
        print('Conectado')

    def disconnected(self):
        self.timer1.init(period=1000, mode=Timer.PERIODIC, callback=lambda t: self.led(1))
        sleep_ms(200)
        self.timer2.init(period=1000, mode=Timer.PERIODIC, callback=lambda t: self.led(0))
        self.connected_status = False
        print('Desconectado')

    def ble_irq(self, event, data):
        #print(event)
        #print(data)
        if event == 1:
            '''Central disconnected'''
            self.connected()
            self.led(1)

        elif event == 2:
            '''Central disconnected'''
            self.advertiser()
            self.disconnected()

        elif event == 3:
            '''New message received'''
            buffer = self.ble.gatts_read(self.rx)
            message = ''
            message = buffer.decode('UTF-8')[:-1]
            # Puedes almacenar los fragmentos recibidos en una lista
            if not hasattr(self, 'received_data'):
                self.received_data = []
            
            self.received_data.append(message)

            # Verifica si el mensaje está completo
            if ']' in message:
                # Reconstruye el mensaje completo
                full_message = ''.join(self.received_data)
                # Reinicia la lista de fragmentos para el próximo mensaje
                self.received_data = []
                self.alarms = json.loads(full_message)
            
            
            if message == 'get-alarms': # La app me solicita las alarmas guardadas
                self.received_data = []
                self.alarms = alarm_storage.load_alarms()
                self.send(json.dumps(self.alarms))
            else:
                alarm_storage.save_alarms(self.alarms) # Guardo la configuración de alarmas recibida desde la app

    def register(self):
        # Nordic UART Service (NUS)
        NUS_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'
        RX_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'
        TX_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'

        BLE_NUS = ubluetooth.UUID(NUS_UUID)
        BLE_RX = (ubluetooth.UUID(RX_UUID), ubluetooth.FLAG_WRITE)
        BLE_TX = (ubluetooth.UUID(TX_UUID), ubluetooth.FLAG_READ | ubluetooth.FLAG_NOTIFY)

        BLE_UART = (BLE_NUS, (BLE_TX, BLE_RX,))
        SERVICES = (BLE_UART, )
        ((self.tx, self.rx,), ) = self.ble.gatts_register_services(SERVICES)

    def send(self, data):
        # La cantidad máxima de bytes que puedo enviar son 20, asi que divido el mensaje en paquetes de 20 bytes
        chunk_size = 20  # Tamaño máximo del paquete BLE
        for i in range(0, len(data), chunk_size):
            chunk = data[i:i+chunk_size]
            self.ble.gatts_notify(0, self.tx, chunk)
            utime.sleep_ms(20)  # Pequeño retraso entre paquetes

    def advertiser(self):
        name = bytes(self.name, 'UTF-8')
        self.ble.gap_advertise(100, bytearray(b'\x02\x01\x02') + bytearray((len(name) + 1, 0x09)) + name)

    def is_connected(self):
        return self.connected_status
    
led = Pin(2, Pin.OUT) # Led indicativo de conexion bluetooth => Si titila esta desconectado, si esta fijo está conectado
ble = BLE("ESP32") # Inicializo el BLE

def apagar_timbre(pin):
    timbre.value(0)
    
    
stop.irq(trigger=Pin.IRQ_RISING, handler=apagar_timbre) # Genero una interrupción para manejar el botón de apagar la alarma

while True:

    # Obtiene la hora actual del RTC
    current_time = rtc.datetime()

    # Formatea la fecha y hora en el formato deseado
    formatted_time = "{:02d}:{:02d}".format(
        current_time[4],  # Hora
        current_time[5]  # Minutos
    )
    tm.numbers(current_time[4], current_time[5]) # Imprimo en el display la hora
    
    for alarm in ble.getAlarms():
        if formatted_time == alarm['time'] and alarm['enabled'] and current_time[6] == 0: # Me fijo si hay una alarma activada que deba ejecutar, lo ejecuto solo cuando los segundos son  00
            timbre.value(1)
    
    # Espera durante 1 segundos
    utime.sleep(1)

