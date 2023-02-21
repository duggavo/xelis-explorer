import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatXelis, reduceText } from '../../utils'
import { Link } from 'react-router-dom'
import useNodeRPC from '../../hooks/useNodeRPC'
import bytes from 'bytes'
import Age from '../../components/age'
import { Helmet } from 'react-helmet'
import TableBody from '../../components/tableBody'
import to from 'await-to-js'
import Pagination, { getPaginationRange } from '../../components/pagination'

function Blocks() {
  const nodeRPC = useNodeRPC()

  const [err, setErr] = useState()
  const [loading, setLoading] = useState(true)
  const [blocks, setBlocks] = useState([])
  const [topoheight, setTopoheight] = useState()
  const [pageState, setPageState] = useState({ page: 1, size: 20 })

  const loadTopoheight = useCallback(async () => {
    const [err, currentTopoheight] = await to(nodeRPC.getTopoHeight())
    if (err) return console.log(err)

    setTopoheight(currentTopoheight)
  }, [])

  const loadBlocks = useCallback(async () => {
    if (!topoheight) return

    const resErr = (err) => {
      setErr(err)
      setLoading(false)
    }

    setLoading(true)
    let pagination = getPaginationRange(pageState)

    let start = topoheight - pagination.end
    if (start < 0) start = 0
    let end = topoheight - pagination.start
    const [err, blocks] = await to(nodeRPC.getBlocks(start, end))
    if (err) return resErr(err)
    setLoading(false)

    setBlocks(blocks.reverse())
  }, [pageState, topoheight])

  useEffect(() => {
    loadTopoheight()
  }, [loadTopoheight])

  useEffect(() => {
    loadBlocks()
  }, [loadBlocks])

  return <div>
    <Helmet>
      <title>Blocks</title>
    </Helmet>
    <h1>Blocks</h1>
    <Pagination state={pageState} setState={setPageState}
      countText="blocks" count={topoheight} style={{ marginBottom: `1em` }} />
    <div className="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Topo Height</th>
            <th>Txs</th>
            <th>Age</th>
            <th>Size</th>
            <th>Hash</th>
            <th>Total Fees</th>
            <th>Miner</th>
            <th>Reward</th>
          </tr>
        </thead>
        <TableBody list={blocks} err={err} loading={loading} colSpan={8} emptyText="No blocks"
          onItem={(item) => {
            const size = bytes.format(item.total_size_in_bytes)
            return <tr key={item.topoheight}>
              <td>
                <Link to={`/blocks/${item.topoheight}`}>{item.topoheight}</Link>
              </td>
              <td>
                {item.txs_hashes.length}
              </td>
              <td>
                <Age timestamp={item.timestamp} format={{ secondsDecimalDigits: 0 }} />
              </td>
              <td>{size}</td>
              <td>{reduceText(item.hash)}</td>
              <td>{formatXelis(item.total_fees)}</td>
              <td>{reduceText(item.miner)}</td>
              <td>{formatXelis(item.reward)}</td>
            </tr>
          }}
        />
      </table>
    </div>
    <Pagination state={pageState} setState={setPageState}
      countText="blocks" count={topoheight} style={{ marginTop: `.5em` }} />
  </div>
}

export default Blocks
