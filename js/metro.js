var map = null;
var markers = [];
var estaciones = [];
var trenes = [];

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: -34.900275, lng: -56.175776 },
    zoom: 14
  });
}

//Cargar eventos desde archivo
var eventos = [];
window.onload = function() {
  var fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', function(e) {
    var file = fileInput.files[0];
    var reader = new FileReader();
    reader.onload = function(progressEvent){
      var lineas = this.result.split('\n');
      for(var i = 0; i < lineas.length; i++){
        eventos.push(lineas[i]);
      }
      animate();
    };
    reader.readAsText(file);
  });
}

//esperas
var esperasTresCruces = [];
var esperasIndependencia = [];
var esperasPuerto = [];

//Reproducir animacion
function animate() {
  var coordenadasLineaA = [
    {lat: -34.894731, lng: -56.165145},
    {lat: -34.898178, lng: -56.166236},
    {lat: -34.905582, lng: -56.185370},
    {lat: -34.906426, lng: -56.199858},
    {lat: -34.908587, lng: -56.207808},
    {lat: -34.904404, lng: -56.209892}
  ];
  var lineaA = new google.maps.Polyline({
    path: coordenadasLineaA,
    geodesic: true,
    strokeColor: '#FF0000',
    strokeOpacity: 1.0,
    strokeWeight: 4
  });

  lineaA.setMap(map);
  agregarEstaciones();

  for (var i = 0; i < eventos.length; i++) {
    var evento = eventos[i].split(",")
    if (evento.length == 1) return;
    var hora = parseInt(evento[0]);
    var tipo = evento[1].trim();
    var accion = null;
    if (tipo == "Arribo cliente") {
      accion = function(evento) {
        var hora = parseInt(evento[0]);
        var id = evento[2];
        var estacion = evento[3].trim();
        var destino = evento[4].trim();
        arriboCliente(estacion, destino)
        $("#eventos tbody").prepend("<tr><td>"+hora+"</td><td>Arribo "+id+"</td><td>estación "+estacion+"</td>");
      };
    }
    if (tipo == "Fin cliente") {
      accion = function(evento) {
        var hora = parseInt(evento[0]);
        var id = evento[2];
        $("#eventos tbody").prepend("<tr class='fin'><td>"+hora+"</td><td>Fin cliente</td><td>"+id+"</td>");
      };
    }
    if (tipo == "Espera") {
      accion = function(evento) {
        var estacion = evento[3].trim();
        var espera = parseFloat(evento[4]);
        if (estacion == "tres-cruces") {
          esperasTresCruces.push(espera);
        }
        if (estacion == "independencia") {
          esperasIndependencia.push(espera);
        }
        if (estacion == "puerto") {
          esperasPuerto.push(espera);
        }
        actualizarEsperas();
      };
    }
    if (tipo == "Salida tren") {
      accion = function(evento) {
        var hora = parseInt(evento[0]);
        var numero = parseInt(evento[2]);
        estacion = evento[3].trim();
        destino = evento[4].trim();
        paradas = getParadas(estacion, destino);
        trenes.push({ id: numero, destino: destino, pasajeros: [], paradas: paradas });
        var icono = getIcono(destino);
        //arriboTren(hora, numero, estacion, destino, paradas, icono);
        $("#eventos tbody").prepend("<tr class='tren'><td>"+hora+"</td><td>Salida tren "+numero+"</td><td>"+estacion+"->"+destino+"</td>");
      };
    }
    if (tipo == "Arribo tren") {
      accion = function(evento) {
        var hora = parseInt(evento[0]);
        numero = parseInt(evento[2]);
        estacion = evento[3].trim();
        var destino = null;
        var paradas = null;
        for (var i = 0; i < trenes.length; i++) {
          if (trenes[i].id == numero) {
            destino = trenes[i].destino;
            paradas = trenes[i].paradas;
          }
        }
        var icono = getIcono(destino);
        arriboTren(hora, numero, estacion, destino, paradas, icono);
        $("#eventos tbody").prepend("<tr class='tren'><td>"+hora+"</td><td>Arribo tren "+numero+"</td><td>"+estacion+"</td>");
      };
    }
    if (tipo == "Fin tren") {
      hora += 200; //delay para ver el tren en estacion final
      accion = function(evento) {
        numero = parseInt(evento[2]);
        eliminarMarker("tren"+numero);
      };
    }
    if (accion != null) {
      window.setTimeout(accion, ((hora+100) * 50), evento);
    }
  }
}

function agregarEstaciones() {
  agregarEstacion("tres-cruces", new google.maps.LatLng(-34.894731, -56.165145));
  agregarEstacion("independencia", new google.maps.LatLng(-34.906426, -56.199858));
  agregarEstacion("puerto", new google.maps.LatLng(-34.904404, -56.209892));
}

function agregarEstacion(estacion, ubicacion) {
  var infoBubble = new InfoBubble({
    content: "<div class='estacion'>"+capitalizeFirstLetter(estacion)+": 0 personas"+"</div>",
    disableAnimation: true,
    arrowSize: 9,
    padding: "5px",
    disableAutoPan: true
  });
  infoBubble.setZIndex(1000);
  infoBubble.setPosition(ubicacion);
  infoBubble.hideCloseButton();
  infoBubble.open(map);
  estaciones.push({ nombre: estacion, cola: [], info: infoBubble })
}

function arriboCliente(estacion, destino) {
  for (var i = 0; i < estaciones.length; i++) {
    if (estaciones[i].nombre == estacion) {
      var estacion = estaciones[i];
      estacion.cola.push(destino);
      estacion.info.setContent("<div class='estacion'>"+capitalizeFirstLetter(estacion.nombre) + ": " + estacion.cola.length + " personas"+"</div>");
      estacion.info.updateContent_();
    }
  }
}

function actualizarEstacion(estacion) {
  for (var i = 0; i < estaciones.length; i++) {
    if (estaciones[i].nombre == estacion) {
      var estacion = estaciones[i];
      estacion.info.setContent("<div class='estacion'>"+capitalizeFirstLetter(estacion.nombre) + ": " + estacion.cola.length + " personas"+"</div>");
      estacion.info.updateContent_();
    }
  }
}

function arriboTren(hora, numero, estacion, destino, paradas, icono) {
  var pasajeros = [];
  var tren = null;
  //Pasajeros en estacion que suben a tren
  var restantes = getParadasRestantes(paradas, estacion);
  for (var i = 0; i < estaciones.length; i++) {
    if (estaciones[i].nombre == estacion) {
      var actual = estaciones[i];
      for (var j=actual.cola.length-1; j>=0; j--) { //iterar de atras para adelante para eliminar elementos
        if ($.inArray(actual.cola[j], restantes) > -1) {
          pasajeros.push(actual.cola[j]);
          actual.cola.splice(j, 1);
        }
      }
    }
  }
  for (var i = 0; i < trenes.length; i++) {
    if (trenes[i].id == numero) {
      tren = trenes[i];
      if (pasajeros.length) {
        tren.pasajeros = tren.pasajeros.concat(pasajeros);
      }
    }
  }
  //Pasajeros de tren que bajan en estacion
  for (var i=tren.pasajeros.length-1; i>=0; i--) { //iterar de atras para adelante para eliminar elementos
    if (tren.pasajeros[i] == estacion) {
      tren.pasajeros.splice(i, 1);
    }
  }
  agregarTren(hora, numero, estacion, tren.pasajeros, icono);
  actualizarEstacion(estacion);
}

function agregarTren(hora, numero, estacion, pasajeros, icono) {
  var markerImage = new google.maps.MarkerImage(icono,
      new google.maps.Size(48, 48),
      new google.maps.Point(0, 0),
      new google.maps.Point(20, 20));
  eliminarMarker("tren"+numero);
  var marker = new google.maps.Marker({
    position: getCoordenadas(estacion),
    map: map,
    icon: markerImage,
    id: "tren"+numero,
    destino: destino,
    zIndex: 1000
  });
  var infowindow = new google.maps.InfoWindow({
    content: pasajeros.length + " pasajeros"
  });
  infowindow.open(map,marker);
  markers.push(marker);
}

function eliminarMarker(id) {
  var eliminar = -1;
  for (var i = 0; i < markers.length; i++) {
    if (markers[i].get("id") == id){
      markers[i].setMap(null);
      eliminar = i;
    }
  }
  if (eliminar > 0)
    markers.splice(eliminar, 1);
}

function getCoordenadas(estacion) {
  switch(estacion) {
    case "tres-cruces":
      return {lat: -34.894731, lng: -56.165145};
    case "independencia":
      return {lat: -34.906426, lng: -56.199858};
    case "puerto":
      return {lat: -34.904404, lng: -56.209892};
    default:
      return {};
  }
}

function getParadas(origen, destino) {
  if (origen == "tres-cruces" && destino == "puerto")
    return [ "tres-cruces", "independencia", "puerto" ]
  if (origen == "puerto" && destino == "tres-cruces")
    return [ "puerto", "independencia", "tres-cruces" ]
}

function getIcono(destino) {
  if (destino == "puerto")
    return "img/trenIzq.png";
  else {
    return "img/trenDer.png"
  }
}

function actualizarEsperas() {
  $("#tres-cruces").text(average(esperasTresCruces));
  $("#independencia").text(average(esperasIndependencia));
  $("#puerto").text(average(esperasPuerto));
}

function average(list) {
  if (list.length == 0)
    return 0;
  var sum = 0;
  for(var i = 0; i < list.length; i++){
      sum += list[i];
  }
  return Math.round(sum/list.length * 100) / 100;
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function getParadasRestantes(paradas, estacion) {
  var pos = -1;
  for (var i = 0; i < paradas.length; i++){
    if (paradas[i] == estacion){
      pos = i;
    }
  }
  return paradas.slice(pos+1, paradas.length);
}
