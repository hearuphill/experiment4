package com.example.demo;

import org.apache.cxf.endpoint.Client;
import org.apache.cxf.jaxws.endpoint.dynamic.JaxWsDynamicClientFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DemoApplication {

    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);


//        JaxWsDynamicClientFactory dcf = JaxWsDynamicClientFactory.newInstance();
//        Client client = dcf.createClient("http://localhost:8080/ws/endpoint?wsdl");
//        try {
//            Object[] objects = client.invoke("calculatePersonalIncomeTax", 6666.0);
//            System.out.println("calculatePersonalIncomeTax(6666.0) 调用结果：" + objects[0].toString());
//
//        } catch (Exception e) {
//            e.printStackTrace();
//        }

        JaxWsDynamicClientFactory dcf = JaxWsDynamicClientFactory.newInstance();
        Client client = dcf.createClient("http://ws.webxml.com.cn/WebServices/WeatherWS.asmx?wsdl");
        try {
            Object[] objects = client.invoke("getWeather", 1117);
            System.out.println("调用结果：" + objects[0].toString());

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

}
