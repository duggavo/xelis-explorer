import { useEffect, useCallback, useState } from 'react'
import useNodeSocket, { useNodeSocketSubscribe } from '@xelis/sdk/react/daemon'
import { RPCEvent } from '@xelis/sdk/daemon/types'
import to from 'await-to-js'
import { Helmet } from 'react-helmet-async'
import { css } from 'goober'
import 'leaflet/dist/leaflet.css'

import TableFlex from '../../components/tableFlex'
import { fetchGeoLocation, parseAddressWithPort, reduceText } from '../../utils'
import DotLoading from '../../components/dotLoading'
import useTheme from '../../context/useTheme'
import Switch from '../../components/switch'

const style = {
  container: css`
    h1 {
      margin: 1.5em 0 .5em 0;
      font-weight: bold;
      font-size: 2em;

      div {
        color: var(--muted-color);
        font-size: .5em;
        margin-top: .2em;
        font-weight: normal;
      }
    }
  `,
  map: css`
    position: relative;
    margin-bottom: 2em;

    .leaflet-container {
      width: 100%; 
      height: 40em; 
      outline: none;
      background-color: var(--bg-color);
    }

    .leaflet-popup-content {
      > :nth-child(1) {
        font-weight: bold;
        padding-bottom: .5em;
      }

      > :nth-child(2), > :nth-child(3) {
        font-size: .9em;
      }
    }
  `,
  mapControls: css`
    position: absolute;
    right: 0;
    z-index: 99999;
    padding: 1em;
    display: flex;
    gap: .5em;
    flex-direction: column;

    > div {
      display: flex;
      gap: 0.5em;
      align-items: center;
      font-weight: bold;
      font-size: .9em;
    }
  `
}

function Peers() {
  const nodeSocket = useNodeSocket()
  const [loading, setLoading] = useState(true)
  const [peers, setPeers] = useState([])
  const [geoLoading, setGeoLoading] = useState(true)
  const [geoLocation, setGeoLocation] = useState({})
  const [err, setErr] = useState()

  const loadPeers = useCallback(async () => {
    if (nodeSocket.readyState !== WebSocket.OPEN) return
    setLoading(true)
    setErr(null)

    const resErr = (err) => {
      setLoading(false)
      setErr(err)
    }

    const [err, result] = await to(nodeSocket.daemon.getPeers())
    if (err) return resErr(err)

    setPeers(result.map((peer) => {
      const addr = parseAddressWithPort(peer.addr)
      if (addr) peer.ip = addr.ip
      return peer
    }))
    setLoading(false)
  }, [nodeSocket])

  const loadGeoLocation = useCallback(async () => {
    if (peers.length === 0) return
    setGeoLoading(true)

    let geoLocation = {}
    const ipList = []
    for (let i = 0; i < peers.length; i++) {
      const peer = peers[i]
      ipList.push(peer.ip)

      peer.peers.forEach((pAddr) => {
        const addr = parseAddressWithPort(pAddr)
        if (ipList.indexOf(addr.ip) === -1) {
          ipList.push(addr.ip)
        }
      })
    }

    // max 50 ips per fetch
    const batch = 50
    for (let i = 0; i < ipList.length; i += batch) {
      const ips = ipList.slice(i, batch)
      const [err, data] = await to(fetchGeoLocation(ips))
      if (err) console.log(err)
      geoLocation = { ...geoLocation, ...data }
    }

    setGeoLocation(geoLocation)
    setGeoLoading(false)
  }, [peers])

  useEffect(() => {
    loadPeers()
  }, [loadPeers])

  useEffect(() => {
    loadGeoLocation()
  }, [loadGeoLocation])

  useNodeSocketSubscribe({
    event: RPCEvent.PeerConnected,
    onData: async (_, peer) => {
      const addr = parseAddressWithPort(peer.addr)
      const [err, data] = await to(fetchGeoLocation([addr.ip]))
      if (err) console.log(err)

      peer.ip = addr.ip
      setGeoLocation((geo) => ({ ...geo, ...data }))
      setPeers((peers) => {
        const exists = peers.find((p) => p.addr === peer.addr)
        if (!exists) return [...peers, peer]
        return peers
      })
    }
  }, [])

  return <div className={style.container}>
    <Helmet>
      <title>Peers</title>
      <meta name="description" content="Map with list of network peers. Monitor connected peers, network status and geo location." />
    </Helmet>
    <h1>
      Peers
      <div>{peers.length} beautiful peers</div>
    </h1>
    <Map peers={peers} geoLocation={geoLocation} />
    <Table loading={loading} err={err} peers={peers} geoLocation={geoLocation} geoLoading={geoLoading} />
  </div>
}

export default Peers

function Table(props) {
  const { loading, err, peers, geoLocation, geoLoading } = props

  return <TableFlex loading={loading} err={err} data={peers} emptyText="No peers"
    rowKey="id"
    headers={[
      {
        key: 'addr',
        title: 'Address',
        render: (value) => {
          return value
        }
      },
      {
        key: 'location',
        title: 'Location',
        render: (_, item) => {
          const data = geoLocation[item.ip]
          if (data && data.country && data.region) {
            return `${data.country} / ${data.region}`
          }

          if (geoLoading) {
            return <DotLoading />
          }

          return `--`
        }
      },
      {
        key: 'peers',
        title: 'Peers',
        render: (value) => {
          return (value || []).length
        }
      },
      {
        key: 'tag',
        title: 'Tag',
        render: (value) => {
          if (value) return reduceText(value, 20, 0)
          return `--`
        }
      },
      {
        key: 'height',
        title: 'Height',
        render: (value) => {
          return value
        }
      },
      {
        key: 'topoheight',
        title: 'Topo',
        render: (value) => {
          return value
        }
      },
      {
        key: 'pruned_topoheight',
        title: 'Pruned Topo',
        render: (value) => {
          return value || `--`
        }
      },
      {
        key: 'version',
        title: 'Version',
        render: (value) => {
          return value
        }
      },
    ]}
  />
}

function MapControls(props) {
  const { controls, setControls } = props
  const { showConnections, showPeers } = controls

  const setControlValue = useCallback((key, value) => {
    setControls((controls) => {
      return { ...controls, [key]: value }
    })
  }, [setControls])

  return <div className={style.mapControls}>
    <div>
      <Switch checked={showPeers} onChange={(checked) => setControlValue('showPeers', checked)} />
      Peers
    </div>
    <div>
      <Switch checked={showConnections} onChange={(checked) => setControlValue('showConnections', checked)} />
      Connections
    </div>
  </div>
}

function Map(props) {
  const { peers, geoLocation } = props

  const { theme } = useTheme()
  const [leaflet, setLeaflet] = useState()
  const [map, setMap] = useState()
  const [controls, setControls] = useState({ showConnections: true, showPeers: true })

  useEffect(() => {
    const load = async () => {
      // load here (client side only) to avoid ssr loading leaflet
      const react = await import('react-leaflet')
      // const { Simple }  = await import('leaflet/src/geo/crs/CRS.Simple')
      setLeaflet({ react })
    }

    load()
  }, [])

  useEffect(() => {
    if (!leaflet) return

    const { MapContainer, TileLayer, CircleMarker, Popup, Polyline } = leaflet.react

    let tileLayerUrl = `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
    if (theme === `light`) {
      tileLayerUrl = `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
    }

    const connectionLines = {}
    const peerDots = {}
    peers.forEach((peer) => {
      const peerLocation = geoLocation[peer.ip]
      if (!peerLocation) return

      const dotPosition = [peerLocation.latitude, peerLocation.longitude]
      const dotKey = (peerLocation.latitude + peerLocation.longitude).toFixed(4)

      if (peerDots[dotKey]) {
        // another peer with the same location
        peerDots[dotKey].peers.push(peer)
      } else {
        peerDots[dotKey] = { peers: [peer], location: peerLocation, position: dotPosition }
      }

      // handle sub peers
      peer.peers.forEach((pAddr) => {
        const addr = parseAddressWithPort(pAddr)
        const subPeerLocation = geoLocation[addr.ip]
        if (!subPeerLocation) return
        const linePositions = [[peerLocation.latitude, peerLocation.longitude], [subPeerLocation.latitude, subPeerLocation.longitude]]
        const lineKey = (peerLocation.latitude + peerLocation.longitude + subPeerLocation.latitude + subPeerLocation.longitude).toFixed(4)

        // keep only one line and overwrite if key exists
        connectionLines[lineKey] = linePositions
      })
    })

    // other providers https://leaflet-extras.github.io/leaflet-providers/preview/
    const map = <MapContainer minZoom={2} zoom={2} preferCanvas center={[0, 0]}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={tileLayerUrl}
      />
      <>
        {controls.showPeers && <>
          {Object.keys(peerDots).map((key) => {
            const { peers, position, location } = peerDots[key]
            return <CircleMarker key={key} radius={6} pathOptions={{ opacity: 1, weight: 3 }} center={position} color="green">
              <Popup>
                <div>{location.country} / {location.region}</div>
                {peers.map((peer) => {
                  return <div key={peer.addr}>{peer.addr} {peer.tag ? `(${peer.tag})` : ``}</div>
                })}
              </Popup>
            </CircleMarker>
          })}
        </>}
        {controls.showConnections && <>
          {Object.keys(connectionLines).map((key) => {
            const positions = connectionLines[key]
            return <Polyline key={key} pathOptions={{ color: `green`, opacity: 0.5, weight: 2, dashArray: `0 6 0` }} positions={positions} />
          })}
        </>}
      </>
    </MapContainer>

    setMap(map)
  }, [leaflet, peers, geoLocation, theme, controls])

  return <div className={style.map}>
    {map && <MapControls controls={controls} setControls={setControls} />}
    {map}
  </div>
}