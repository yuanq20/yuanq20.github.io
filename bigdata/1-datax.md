# 一、导数存在问题
数仓分析中，一些数据源来自不同系统，比如我司就有来自mongodb、elasticsearch、mysql、oracle、binlog、log日志等。flume、sqoop、canal可以完成大部分数据库类、日志类数据同步。但是对于一格稍显冷门的elasticsearch、mongodb这些组件同步数据需求暂不支持。所以我们采用了DataX，一款阿里开源的离线数据同步工具。

# 二、DataX使用及二次开发
DataX为了考虑支持更多数据源，采用Framework + plugin架构。插件主要实现了一些共性问题，比如：类型转换、性能、统计等。
它采用Job+Task执行模型，一个Job代表一次作业，它可以根据各组件定义逻辑实现切片划分多个Task任务，而Task就是Job拆分得到的最小执行单元，用于并发执行，是真正干活的线程。
![image](https://note.youdao.com/yws/public/resource/a8d48b4baf54f07178e53e895aeafb58/xmlnote/BEF2006A0097453C9337C9AC8E0E004B/2158)

插件开发是以assembly形式打包，其主要路程，类似flume中 reader->channel->writer。通过RecordSender往channel写入数据，通过RecordReceiver从channel读取数据。

类同flume中的Event事件，channel中传输的对象这里它采用的是Record。Record中可以放多个Column对象，所以，对于我们开发reader插件时，主要是考虑构建Record记录，开发Writer时，考虑如何将读取的Record转换为特定类型的数据源对象。

1、开始使用，比如从MySQL->HDFS，详情见官网，部分见注释

```
python2 ./bin/datax.py ./conf/conf.json   #里面是python调用JAVA，读取此配置文件
```
conf.json配置如下：

```
{
	"job": {
		"content": [
			{
				"reader": {  #读取源
					"name": "rdbmsreader",
					"parameter": {
						"column": [
							"uid"
						],
						"connection": [
							{
								"jdbcUrl": [
									"jdbc:hive2://impala.fcbox.com:1002/dw_ods"
								],
								"table": [
									"AIPRD_Cron_223190910210236"
								]
							}
						],
						"fetchSize": 1024,
						"password": "******",
						"username": "u_dsg01"
					}
				},
				"writer": {  #写入目的地
					"name": "hdfswriter",
					"parameter": {
						"column": [
							{
								"name": "uid",
								"type": "STRING"
							}
						],
						"defaultFS": "hdfs://nameservice2",
						"fieldDelimiter": ",",
						"fileName": "214_女性用户",
						"fileType": "text",
						"hadoopConfig": {
							"dfs.namenode.rpc-address.nameservice2.namenode412": "dcn-Hfdf-DN-v-l-09.fcbox.com:8020",
							"dfs.client.failover.proxy.provider.nameservice2": "org.apache.hadoop.hdfs.server.namenode.ha.ConfiguredFailoverProxyProvider",
							"dfs.namenode.rpc-address.nameservice2.namenode719": "dcn-Hfdf-DN-v-l-08.fcbox.com:8020",
							"fs.defaultFS": "hdfs://nameservice2",
							"dfs.nameservices": "nameservice2",
							"dfs.ha.namenodes.nameservice2": "namenode719,namenode412"
						},
						"path": "/dot/hdfs/AIPRD/214",
						"writeMode": "truncate"
					}
				}
			}
		],
		"setting": {
			"speed": {     #采用字节限制
				"channel": 10,
				"byte": 1048576
			}
		}
	}
}
```

2、二次开发及部分改造

官网没有elasticsearch读插件、Kafka写入插件，而我司实际场景部分用到，所以需要额外开发。其实通过上面原理介绍，基本思路已出，比如：开发KafkaWriter插件，一般扩展Writer，里层实现Job与Task接口。真正Task实现，真正干活startWrite逻辑如下：（是不是最终还是kafka那套^_^）

```
@Override
public void startWrite(RecordReceiver recordReceiver) {
	LOG.info("fcbox begin do write...");

	String fieldDelimiter = writerSliceConfig.getString(Key.FIELDDELIMITER, ",");

	Record record = null;
	long total = 0;
	while ((record = recordReceiver.getFromReader()) != null) {
		StringBuilder sb = new StringBuilder();
		for (int i = 0; i < record.getColumnNumber(); i++) {
			Column column = record.getColumn(i);
			sb.append(column.asString()).append(fieldDelimiter);
		}

		if(sb.length() > fieldDelimiter.length()) {
			sb.setLength(sb.length() - fieldDelimiter.length());
		}

		// 发送kafka
		String topic = writerSliceConfig.getString(Key.TOPIC);
		ProducerRecord<String, String> producerRecord = new ProducerRecord<String, String>(topic,  sb.toString());
		producer.send(producerRecord);
	}

	LOG.info("fcbox end do write");
}
```


另外，当前版本，有同学问到，迁移Mysql时，可否支持增量导数，其实工具本身不支持，我们想到的是，可以变相通过SQL语句增量实现导数。


# 三、案例：取用户包
- 需求：这是一个实际使用场景，取用户包，
- 流程：调用方传递不同SQL，通过数仓最终导出到不同目的地（调用方指定，比hdfs、kafka）。
- 实现：该案例中，我们对接spark SQL产生多个文件，没有利用DataX切片，因为它需要指定分片字段，而传递SQL，我们目前没有考虑让用户指定，所以，正好利用Spark SQL adaptive 特性，自动根据Block块大小切片。刚开始采用RDBMS读取源，考虑kyuubi Driver瓶颈，后期优化为直接读取HDFS。
- 比如，历史待激活用户，结果如下：
```
2019-11-04 16:40:58.983 [job-0] INFO  JobContainer - 
	 [total cpu info] => 
		averageCpu                     | maxDeltaCpu                    | minDeltaCpu                    
		-1.00%                         | -1.00%                         | -1.00%
                        
	 [total gc info] => 
		 NAME                 | totalGCCount       | maxDeltaGCCount    | minDeltaGCCount    | totalGCTime        | maxDeltaGCTime     | minDeltaGCTime     
		 PS MarkSweep         | 2                  | 2                  | 2                  | 0.068s             | 0.068s             | 0.068s             
		 PS Scavenge          | 62                 | 62                 | 62                 | 0.166s             | 0.166s             | 0.166s             
2019-11-04 16:40:58.983 [job-0] INFO  JobContainer - PerfTrace not enable!
2019-11-04 16:40:58.983 [job-0] INFO  StandAloneJobContainerCommunicator - Total 10252216 records, 294309050 bytes | Speed 14.03MB/s, 512610 records/s | Error 0 records, 0 bytes |  All Task WaitWriterTime 6.043s |  All Task WaitReaderTime 0.852s | Percentage 100.00%
2019-11-04 16:40:58.985 [job-0] INFO  JobContainer - 
任务启动时刻                    : 2019-11-04 16:40:33
任务结束时刻                    : 2019-11-04 16:40:58
任务总计耗时                    :                 25s
任务平均流量                    :           14.03MB/s
记录写入速度                    :         512610rec/s
读出记录总数                    :            10252216
读写失败总数                    :                   0
脚本运行结果:0
2019-11-04 16:40:59 shell datax ended success
```
